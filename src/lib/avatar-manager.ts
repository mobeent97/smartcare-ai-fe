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
import { streamLog } from './stream-log';

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
  /** Live providers only: the streaming session ended unexpectedly (e.g. hit its
   *  duration cap). The next speak() transparently reopens. The page can use this
   *  to reset its "stream ready" visual back to the connecting placeholder. */
  onStreamClosed?: () => void;
}

export interface AvatarManager {
  readonly provider: AvatarProvider;
  readonly isLive: boolean;
  /** Open the streaming session if not already open (lazy). No-op for video. */
  ensureOpen(): Promise<void>;
  /** Open AND wait until the stream is actually live (video published), so a
   *  caller can hold back speech/conversation until the face can speak. Optional;
   *  callers should treat absence as "ready immediately". */
  ensureReady?(): Promise<void>;
  speak(text: string): Promise<void>;
  interrupt(): void;
  showListening(): void;
  showIdle(): void;
  /** Cost guard: tear down the live stream to stop billing while idle. No-op
   *  for video. ensureOpen() transparently reopens on the next speak(). */
  closeStream(): Promise<void>;
  /** Triage is finishing: stop ever opening a NEW session (the backend has left
   *  IN_PROGRESS, so create would 403), but let an already-live stream keep
   *  speaking its final lines. Optional; absence = nothing to gate. */
  preventReopen?(): void;
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
  preventReopen(): void { /* no stream — nothing to gate */ }
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
  private _noReopen = false;

  constructor(opts: AvatarManagerOptions) { this._opts = opts; }

  // Triage done: never create a fresh session again (would 403 on a
  // non-IN_PROGRESS session). An already-live stream keeps working so it can
  // speak the closing line; speak() on a closed stream becomes a silent no-op.
  preventReopen(): void {
    this._noReopen = true;
    streamLog(this._opts.sessionId, 'MGR_PREVENT_REOPEN', { hasLiveStream: !!this._mgr });
  }

  // Open the stream AND wait until the avatar video has actually published, so
  // the caller (realtime hybrid) can hold OpenAI's first utterance until the
  // face is live — otherwise speech queues and replays out of sync once ready.
  async ensureReady(): Promise<void> {
    await this.ensureOpen();
    if (this._destroyed || !this._mgr) return;
    await this._mgr.awaitReady();
  }

  async ensureOpen(): Promise<void> {
    if (this._destroyed || this._mgr) return;
    if (this._noReopen) return; // triage finished — don't mint a new (403-ing) session
    streamLog(this._opts.sessionId, 'MGR_REOPEN'); // _mgr was null → minting a fresh session
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
      onStreamClosed: this._onStreamClosed,
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

  // The AKOOL bot left the channel — the live session is dead. Drop the inner
  // manager so the next speak() opens a fresh one (ensureOpen sees _mgr === null).
  // Release any in-flight speak() and tell the page to reset its "stream ready"
  // visual back to the connecting placeholder.
  private _onStreamClosed = (): void => {
    if (this._destroyed) return;
    streamLog(this._opts.sessionId, 'MGR_STREAM_CLOSED', { noReopen: this._noReopen });
    this._finishSpeak();
    const dead = this._mgr;
    this._mgr = null;
    this._akoolSessionId = null;
    // Leave the Agora channel cleanly so the fresh session's client doesn't
    // collide on uid. Fire-and-forget — we don't block the next speak on it.
    dead?.destroy().catch(() => {});
    this._opts.onStreamClosed?.();
    this._opts.onStateChange?.('idle');
  };

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
      streamLog(this._opts.sessionId, 'MGR_CLOSE_STREAM', { destroyed: this._destroyed });
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
