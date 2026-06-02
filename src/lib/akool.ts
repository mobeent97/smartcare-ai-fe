// AKOOL streaming avatar via the official SDK (akool-streaming-avatar-sdk).
//
// Flow per AKOOL best practice:
//   1. backend create_session (mode:1 repeat) -> Agora creds  [api.createAvatarSession]
//   2. new GenericAgoraSDK -> joinChannel(creds)
//   3. WAIT for the avatar video to publish (onUserPublished 'video') = stream
//      ready, THEN sendMessage(text). Text sent before ready is dropped by
//      AKOOL — that was the no-lipsync bug. We queue speak() calls until ready
//      and flush on publish.
//
// Voice + language + repeat-mode are bound at session creation (backend), so
// the client only needs sendMessage(text) / interrupt().

import { GenericAgoraSDK } from 'akool-streaming-avatar-sdk';
import type { IRemoteVideoTrack, IRemoteAudioTrack } from 'agora-rtc-sdk-ng';
import { api } from './api';

interface AvatarManagerOptions {
  sessionId: string;
  avatarType?: 'nurse' | 'doctor';
  videoElement: HTMLVideoElement;
  onConnectionChange?: (state: 'connecting' | 'connected' | 'disconnected') => void;
  onError?: (error: Error) => void;
}

let _instance: AKOOLAvatarManager | null = null;

export function getAvatarManager(): AKOOLAvatarManager | null {
  return _instance;
}

export class AKOOLAvatarManager {
  private sdk: GenericAgoraSDK | null = null;
  private akoolSessionId: string | null = null;
  private isMockMode = false;
  private ready = false;
  private readyResolvers: Array<() => void> = [];
  private queue: string[] = [];
  private options: AvatarManagerOptions;
  private _destroyed = false;

  constructor(options: AvatarManagerOptions) {
    this.options = options;
    if (_instance && _instance !== this) {
      _instance.destroy().catch(() => {});
    }
    _instance = this;
  }

  async initialize(): Promise<{ akoolSessionId: string; mode: 'live' | 'mock' }> {
    this.options.onConnectionChange?.('connecting');
    try {
      const response = await api.createAvatarSession(
        this.options.sessionId,
        this.options.avatarType ?? 'nurse',
      );
      // StrictMode cleanup may have destroyed us mid-request.
      if (this._destroyed) {
        const err = new Error('AKOOLAvatarManager destroyed during init');
        (err as Error & { _cancelled?: boolean })._cancelled = true;
        throw err;
      }

      const data = response.data;
      console.log('[AKOOL] session created:', JSON.stringify(data));
      this.akoolSessionId = data.session_id;
      this.isMockMode = data.mode === 'mock';

      if (this.isMockMode) {
        console.log('[AKOOL] mock mode — no live stream');
        this.options.onConnectionChange?.('connected');
        return { akoolSessionId: this.akoolSessionId!, mode: 'mock' };
      }

      const sdk = new GenericAgoraSDK({ mode: 'rtc', codec: 'vp8' });
      this.sdk = sdk;

      sdk.on({
        onUserPublished: async (user, mediaType) => {
          if (this._destroyed) return;
          if (mediaType !== 'video' && mediaType !== 'audio') return;
          try {
            const track = await sdk.getClient().subscribe(user, mediaType);
            if (this._destroyed) return;
            if (mediaType === 'video') {
              (track as IRemoteVideoTrack)?.play(this.options.videoElement);
              this.ready = true;
              console.log('[AKOOL] video published — stream ready, flushing queued speech');
              this.options.onConnectionChange?.('connected');
              this.readyResolvers.forEach((r) => r());
              this.readyResolvers = [];
              this._flush();
            } else {
              (track as IRemoteAudioTrack)?.play();
            }
          } catch (e) {
            console.error('[AKOOL] subscribe error:', e);
          }
        },
        onException: (e) => {
          console.error('[AKOOL] exception:', e);
          if (!this._destroyed) this.options.onError?.(new Error(`AKOOL ${e.code}: ${e.msg}`));
        },
        // Log what AKOOL sends back so we can find an explicit "avatar finished
        // speaking" signal to drive listening instead of a duration estimate.
        onStreamMessage: (uid, message) => {
          console.log('[AKOOL] streamMessage', uid, JSON.stringify(message));
        },
        onMessageReceived: (m) => {
          console.log('[AKOOL] messageReceived', JSON.stringify(m));
        },
      });

      await sdk.joinChannel({
        agora_app_id: data.agora_app_id ?? process.env.NEXT_PUBLIC_AGORA_APP_ID ?? '',
        agora_channel: data.agora_channel ?? '',
        agora_token: data.agora_token ?? '',
        agora_uid: data.agora_uid ?? 0,
      });
      console.log('[AKOOL] joined channel, awaiting avatar publish…');

      return { akoolSessionId: this.akoolSessionId!, mode: data.mode ?? 'live' };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (!this._destroyed) {
        console.error('[AKOOL] initialize error:', err);
        this.options.onError?.(err);
      }
      throw err;
    }
  }

  /** Resolves once the avatar video has published (stream actually live), so
   *  callers can align subtitles/UI with real speech instead of the moment the
   *  text was queued. Resolves immediately in mock mode; times out as a guard. */
  awaitReady(timeoutMs = 15000): Promise<void> {
    if (this.ready || this.isMockMode || this._destroyed) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, timeoutMs);
      this.readyResolvers.push(() => { clearTimeout(t); resolve(); });
    });
  }

  /** Send any speech buffered before the stream was ready. */
  private _flush(): void {
    const pending = this.queue;
    this.queue = [];
    for (const text of pending) {
      this.sdk?.sendMessage(text).catch((e) => console.warn('[AKOOL] sendMessage failed:', e));
    }
  }

  /** Make the avatar speak (repeat mode). Queues until the stream is ready. */
  async speak(text: string): Promise<void> {
    if (this.isMockMode || this._destroyed || !text.trim()) return;
    if (!this.ready || !this.sdk) {
      this.queue.push(text); // flushed on video publish
      return;
    }
    try {
      await this.sdk.sendMessage(text);
    } catch (e) {
      console.warn('[AKOOL] sendMessage failed:', e);
    }
  }

  async interrupt(): Promise<void> {
    this.queue = [];
    if (this.sdk && !this._destroyed) {
      try { await this.sdk.interrupt(); } catch (e) { console.warn('[AKOOL] interrupt failed:', e); }
    }
  }

  attachVideo(el: HTMLVideoElement): void {
    this.options.videoElement = el;
  }

  async destroy(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;
    this.queue = [];
    this.readyResolvers.forEach((r) => r()); // unblock any awaitReady() waiters
    this.readyResolvers = [];

    // Close the AKOOL session server-side first so billing stops even if the
    // SDK teardown hiccups.
    if (!this.isMockMode && this.akoolSessionId) {
      try { await api.closeAvatarSession(this.akoolSessionId, this.options.sessionId); } catch { /* best-effort */ }
    }
    if (this.sdk) {
      try { await this.sdk.closeStreaming(); } catch { /* best-effort */ }
      this.sdk = null;
    }
    this.options.onConnectionChange?.('disconnected');
    this.akoolSessionId = null;
    if (_instance === this) _instance = null;
  }

  get isLive(): boolean {
    return !this.isMockMode && !this._destroyed && this.akoolSessionId !== null;
  }
}
