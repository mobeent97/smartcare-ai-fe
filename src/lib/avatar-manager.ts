// Unified avatar manager — one interface over three providers (video | akool |
// heygen) so the booth page is provider-agnostic. The active provider is set
// per deploy via NEXT_PUBLIC_AVATAR_PROVIDER (kept in sync with the backend
// AVATAR_PROVIDER env). See AVATAR_PROVIDER_PLAN.md.
//
// Cost model: 'video' (mp4 loop + OpenAI TTS) has zero streaming cost and is
// the default. 'akool'/'heygen' are LIVE and bill per session-minute, so they
// are opened lazily (first speak, not page mount), torn down while idle
// (closeStream), and closed hard on exit (beacon). ensureOpen() reopens on the
// next speak after an idle close.

import { VideoAvatarManager, type VideoState } from './video-avatar';

export type AvatarProvider = 'video' | 'akool' | 'heygen';
export type AvatarVisualState = VideoState; // 'idle' | 'speaking' | 'listening'

export interface AvatarManagerOptions {
  sessionId: string;
  avatarType?: 'nurse' | 'doctor';
  /** Live providers attach their remote stream here; the video provider ignores it. */
  getVideoElement?: () => HTMLVideoElement | null;
  onStateChange?: (state: AvatarVisualState) => void;
  onWaveform?: (data: Float32Array) => void;
  onSubtitle?: (text: string) => void;
  onError?: (error: Error) => void;
}

export interface AvatarManager {
  readonly provider: AvatarProvider;
  readonly isLive: boolean;
  /** Open the streaming session if not already open (lazy). No-op for video. */
  ensureOpen(): Promise<void>;
  speak(text: string): Promise<void>;
  interrupt(): void;
  showListening(): void;
  showIdle(): void;
  /** Cost guard: tear down the live stream to stop billing while idle. No-op
   *  for video. ensureOpen() transparently reopens on the next speak(). */
  closeStream(): Promise<void>;
  /** Synchronous payload for a navigator.sendBeacon close on page unload.
   *  Null when there is nothing server-side to close (video/heygen). */
  beaconClosePayload(): { akoolSessionId: string; sessionId: string } | null;
  destroy(): Promise<void>;
}

// ─── Active-manager singleton ───────────────────────────────────────────────
let _active: AvatarManager | null = null;
export function getActiveAvatarManager(): AvatarManager | null {
  return _active;
}

// ─── Approximate speak duration for live providers ──────────────────────────
// AKOOL/HeyGen render TTS on their side; we don't get an audio blob to await.
// Estimate completion so the page flips to 'listening' at the right time.
// 400ms/word ≈ 150 wpm + a tail buffer. Mirrors the realtime-path heuristic.
function estimateSpeechMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1200, words * 400 + 1200);
}

// ─── video provider ─────────────────────────────────────────────────────────
class VideoLoopAvatar implements AvatarManager {
  readonly provider = 'video' as const;
  readonly isLive = false;
  private _mgr: VideoAvatarManager;

  constructor(opts: AvatarManagerOptions) {
    this._mgr = new VideoAvatarManager({
      onStateChange: opts.onStateChange,
      onWaveform: opts.onWaveform,
      onSubtitle: opts.onSubtitle,
    });
  }

  async ensureOpen(): Promise<void> { /* no stream — nothing to open */ }
  async speak(text: string): Promise<void> { return this._mgr.speak(text); }
  interrupt(): void { this._mgr.interrupt(); }
  showListening(): void { this._mgr.showListening(); }
  showIdle(): void { this._mgr.showIdle(); }
  async closeStream(): Promise<void> { /* no stream */ }
  beaconClosePayload(): null { return null; }
  async destroy(): Promise<void> {
    this._mgr.destroy();
    if (_active === this) _active = null;
  }
}

// ─── akool provider (live, lazy) ────────────────────────────────────────────
class AkoolAvatar implements AvatarManager {
  readonly provider = 'akool' as const;
  readonly isLive = true;
  private _opts: AvatarManagerOptions;
  private _mgr: import('./akool').AKOOLAvatarManager | null = null;
  private _akoolSessionId: string | null = null;
  private _speakTimer: ReturnType<typeof setTimeout> | null = null;
  private _subtitleTimer: ReturnType<typeof setInterval> | null = null;
  private _currentText = '';
  private _resolveSpeak: (() => void) | null = null;
  private _destroyed = false;

  constructor(opts: AvatarManagerOptions) { this._opts = opts; }

  async ensureOpen(): Promise<void> {
    if (this._destroyed || this._mgr) return;
    const { AKOOLAvatarManager } = await import('./akool');
    const el = this._opts.getVideoElement?.();
    if (!el) throw new Error('AKOOL avatar: no video element to attach');
    const mgr = new AKOOLAvatarManager({
      sessionId: this._opts.sessionId,
      avatarType: this._opts.avatarType ?? 'nurse',
      videoElement: el,
      onError: this._opts.onError,
      // Drive subtitles + speaking-state off AKOOL's real audio boundaries.
      onAudioStart: this._onAudioStart,
      onAudioEnd: this._onAudioEnd,
    });
    const { akoolSessionId } = await mgr.initialize();
    if (this._destroyed) { await mgr.destroy(); return; }
    this._mgr = mgr;
    this._akoolSessionId = akoolSessionId;
  }

  // speak() resolves on AKOOL's audio_end event (the true end of speech), with
  // a generous timeout fallback in case the event never arrives.
  async speak(text: string): Promise<void> {
    if (this._destroyed || !text.trim()) return;
    await this.ensureOpen();
    if (this._destroyed || !this._mgr) return;
    await this._mgr.awaitReady();
    if (this._destroyed || !this._mgr) return;
    this._currentText = text;
    await new Promise<void>((resolve) => {
      this._resolveSpeak = resolve;
      this._speakTimer = setTimeout(() => this._finishSpeak(), estimateSpeechMs(text) + 10000);
      this._mgr!.speak(text).catch(() => this._finishSpeak());
    });
  }

  private _onAudioStart = (): void => {
    if (this._destroyed) return;
    this._opts.onStateChange?.('speaking');
    this._startSubtitles(this._currentText);
  };
  private _onAudioEnd = (): void => { this._finishSpeak(); };

  private _finishSpeak(): void {
    if (this._speakTimer) { clearTimeout(this._speakTimer); this._speakTimer = null; }
    this._stopSubtitles();
    if (!this._destroyed) this._opts.onStateChange?.('idle');
    const r = this._resolveSpeak;
    this._resolveSpeak = null;
    if (r) r();
  }

  interrupt(): void {
    this._mgr?.interrupt().catch(() => {});
    this._finishSpeak();
    this._opts.onStateChange?.('listening');
  }
  showListening(): void { this._clearTimers(); this._opts.onStateChange?.('listening'); }
  showIdle(): void { this._clearTimers(); this._opts.onStateChange?.('idle'); }

  async closeStream(): Promise<void> {
    this._finishSpeak(); // release any in-flight speak() so callers don't hang
    if (this._mgr) {
      try { await this._mgr.destroy(); } catch { /* best-effort */ }
      this._mgr = null;
      this._akoolSessionId = null;
    }
  }

  beaconClosePayload(): { akoolSessionId: string; sessionId: string } | null {
    if (!this._akoolSessionId) return null;
    return { akoolSessionId: this._akoolSessionId, sessionId: this._opts.sessionId };
  }

  async destroy(): Promise<void> {
    this._destroyed = true;
    await this.closeStream();
    if (_active === this) _active = null;
  }

  private _startSubtitles(text: string): void {
    if (!this._opts.onSubtitle) return;
    const words = text.split(/\s+/);
    let idx = 0;
    this._subtitleTimer = setInterval(() => {
      if (idx >= words.length) { this._stopSubtitles(); return; }
      this._opts.onSubtitle!(words.slice(0, ++idx).join(' '));
    }, 380);
  }
  private _stopSubtitles(): void {
    if (this._subtitleTimer) { clearInterval(this._subtitleTimer); this._subtitleTimer = null; }
    this._opts.onSubtitle?.('');
  }
  private _clearTimers(): void {
    if (this._speakTimer) { clearTimeout(this._speakTimer); this._speakTimer = null; }
    this._stopSubtitles();
  }
}

// ─── factory ────────────────────────────────────────────────────────────────
export function getConfiguredProvider(): AvatarProvider {
  const p = (process.env.NEXT_PUBLIC_AVATAR_PROVIDER || 'video').toLowerCase();
  return p === 'akool' || p === 'heygen' ? p : 'video';
}

export async function createAvatarManager(
  provider: AvatarProvider,
  opts: AvatarManagerOptions,
): Promise<AvatarManager> {
  // Replace any prior active manager (StrictMode double-mount safety).
  if (_active) { await _active.destroy().catch(() => {}); }

  let mgr: AvatarManager;
  if (provider === 'akool') {
    mgr = new AkoolAvatar(opts);
  } else if (provider === 'heygen') {
    const { HeygenAvatar } = await import('./heygen');
    mgr = new HeygenAvatar(opts);
  } else {
    mgr = new VideoLoopAvatar(opts);
  }
  _active = mgr;
  return mgr;
}
