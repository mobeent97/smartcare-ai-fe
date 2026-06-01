// HeyGen interactive streaming avatar adapter (implements AvatarManager).
//
// The browser never sees the master HEYGEN_API_KEY — it gets a short-lived
// streaming token from the backend (createAvatarSession → provider:'heygen').
// The avatar speaks via HeyGen's built-in TTS (REPEAT task), so no separate
// TTS round-trip. Live + per-minute billed → opened lazily, torn down on idle.
//
// This module is only dynamically imported when AVATAR_PROVIDER=heygen, so the
// @heygen/streaming-avatar SDK is code-split out of the video/akool bundles.
// Requires `npm install @heygen/streaming-avatar` in the deploy env.

import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskType,
  TaskMode,
} from '@heygen/streaming-avatar';
import { api } from './api';
import type { AvatarManager, AvatarManagerOptions } from './avatar-manager';

function mapQuality(q: string | undefined): AvatarQuality {
  if (q === 'high') return AvatarQuality.High;
  if (q === 'medium') return AvatarQuality.Medium;
  return AvatarQuality.Low;
}

export class HeygenAvatar implements AvatarManager {
  readonly provider = 'heygen' as const;
  readonly isLive = true;
  private _opts: AvatarManagerOptions;
  private _avatar: StreamingAvatar | null = null;
  private _opening: Promise<void> | null = null;
  private _destroyed = false;

  constructor(opts: AvatarManagerOptions) { this._opts = opts; }

  async ensureOpen(): Promise<void> {
    if (this._destroyed || this._avatar) return;
    if (this._opening) return this._opening;
    this._opening = this._open();
    try { await this._opening; } finally { this._opening = null; }
  }

  private async _open(): Promise<void> {
    // Mint the short-lived streaming token (billable session starts here).
    const res = await api.createAvatarSession(this._opts.sessionId, this._opts.avatarType ?? 'nurse');
    const data = res.data;
    if (this._destroyed) return;
    if (data.provider !== 'heygen' || !data.token) {
      throw new Error('HeyGen avatar: backend did not return a streaming token');
    }

    const avatar = new StreamingAvatar({ token: data.token });

    avatar.on(StreamingEvents.STREAM_READY, (event: { detail?: unknown }) => {
      const el = this._opts.getVideoElement?.();
      const stream = event?.detail;
      if (el && stream instanceof MediaStream) {
        el.srcObject = stream;
        el.muted = false;
        el.play().catch(() => {});
      }
    });
    avatar.on(StreamingEvents.AVATAR_START_TALKING, () => this._opts.onStateChange?.('speaking'));
    avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => this._opts.onStateChange?.('idle'));
    avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => { this._avatar = null; });

    await avatar.createStartAvatar({
      quality: mapQuality(data.quality),
      avatarName: data.avatar_id ?? '',
      ...(data.voice_id ? { voice: { voiceId: data.voice_id } } : {}),
    });
    if (this._destroyed) { try { await avatar.stopAvatar(); } catch { /* ignore */ } return; }
    this._avatar = avatar;
  }

  async speak(text: string): Promise<void> {
    if (this._destroyed || !text.trim()) return;
    await this.ensureOpen();
    if (this._destroyed || !this._avatar) return;
    this._opts.onSubtitle?.(text);
    // SYNC task resolves when the avatar finishes speaking.
    await this._avatar.speak({ text, taskType: TaskType.REPEAT, taskMode: TaskMode.SYNC });
    this._opts.onSubtitle?.('');
    if (!this._destroyed) this._opts.onStateChange?.('idle');
  }

  interrupt(): void {
    this._avatar?.interrupt().catch(() => {});
    this._opts.onSubtitle?.('');
    this._opts.onStateChange?.('listening');
  }
  showListening(): void { this._opts.onStateChange?.('listening'); }
  showIdle(): void { this._opts.onStateChange?.('idle'); }

  async closeStream(): Promise<void> {
    if (this._avatar) {
      try { await this._avatar.stopAvatar(); } catch { /* best-effort */ }
      this._avatar = null;
    }
  }

  // HeyGen sessions are closed client-side via stopAvatar(); nothing for the
  // server to close on unload.
  beaconClosePayload(): null { return null; }

  async destroy(): Promise<void> {
    this._destroyed = true;
    await this.closeStream();
  }
}
