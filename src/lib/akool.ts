import type { IAgoraRTCClient, IRemoteVideoTrack, IRemoteAudioTrack } from 'agora-rtc-sdk-ng';
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
  private client: IAgoraRTCClient | null = null;
  private remoteVideoTrack: IRemoteVideoTrack | null = null;
  private remoteAudioTrack: IRemoteAudioTrack | null = null;
  private akoolSessionId: string | null = null;
  private isMockMode = false;
  private options: AvatarManagerOptions;
  private _statusPoller: ReturnType<typeof setInterval> | null = null;
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
        this.options.avatarType ?? 'nurse'
      );

      // Abort silently if StrictMode cleanup destroyed us during the HTTP request
      if (this._destroyed) {
        const err = new Error('AKOOLAvatarManager destroyed during init');
        (err as Error & { _cancelled?: boolean })._cancelled = true;
        throw err;
      }

      const data = response.data;
      console.log('[AKOOL] Avatar session created:', JSON.stringify(data));
      this.akoolSessionId = data.session_id;
      this.isMockMode = data.mode === 'mock';

      if (this.isMockMode) {
        console.log('[AKOOL] Running in mock mode — no real stream');
        this.options.onConnectionChange?.('connected');
      } else {
        this._startStatusPoller();
        await this._connectAgora(
          data.agora_app_id ?? process.env.NEXT_PUBLIC_AGORA_APP_ID ?? '',
          data.agora_channel ?? '',
          data.agora_token ?? '',
          data.agora_uid ?? 12345
        );
      }
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

  private _startStatusPoller(): void {
    if (!this.akoolSessionId) return;
    let attempts = 0;
    this._statusPoller = setInterval(async () => {
      if (this._destroyed) { clearInterval(this._statusPoller!); return; }
      attempts++;
      try {
        const json = await api.getAvatarSessionStatus(this.akoolSessionId!);
        const sessionData = (json?.data as any)?.data ?? json?.data ?? {};
        const sessionStatus = sessionData.status ?? sessionData.stream_status ?? '?';
        console.log(`[AKOOL] Session status poll #${attempts}: status=${sessionStatus}`, sessionData);
        if (sessionStatus === 3 || sessionStatus === '3') {
          console.log('[AKOOL] Session reached streaming state (status=3) ✅');
          clearInterval(this._statusPoller!);
          this._statusPoller = null;
        }
        if (attempts >= 24) {
          console.warn('[AKOOL] Status poll timeout after 2 min');
          clearInterval(this._statusPoller!);
          this._statusPoller = null;
        }
      } catch (e) {
        console.warn('[AKOOL] Status poll error:', e);
      }
    }, 5000);
  }

  private async _connectAgora(
    appId: string,
    channel: string,
    token: string,
    uid: number
  ): Promise<void> {
    if (this._destroyed) return;
    console.log(`[AKOOL] Connecting Agora — appId=${appId.slice(0,8)}… channel=${channel} uid=${uid} token=${token ? 'present' : 'EMPTY'}`);

    const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
    AgoraRTC.setLogLevel(2); // warnings only — suppress verbose Agora noise

    if (this._destroyed) return;

    this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'h264' });

    this.client.on('connection-state-change', (cur, prev) => {
      console.log(`[AKOOL] Agora connection state: ${prev} → ${cur}`);
    });

    this.client.on('user-joined', (user) => {
      console.log('[AKOOL] Remote user joined channel:', user.uid);
    });

    this.client.on('user-left', (user, reason) => {
      console.log('[AKOOL] Remote user left:', user.uid, reason);
    });

    this.client.on('exception', (evt) => {
      console.error('[AKOOL] Agora exception:', evt);
    });

    this.client.on('user-published', async (user, mediaType) => {
      if (this._destroyed) return;
      console.log(`[AKOOL] user-published uid=${user.uid} mediaType=${mediaType}`);

      try {
        await this.client!.subscribe(user, mediaType);
        console.log(`[AKOOL] Subscribed to ${mediaType} from uid=${user.uid}`);
      } catch (e) {
        console.error(`[AKOOL] Subscribe error for ${mediaType}:`, e);
        return;
      }

      if (this._destroyed) return;

      if (mediaType === 'video') {
        this.remoteVideoTrack = user.videoTrack ?? null;
        if (this.remoteVideoTrack) {
          console.log('[AKOOL] Playing video on element:', this.options.videoElement.tagName, 'muted:', this.options.videoElement.muted);
          this.remoteVideoTrack.play(this.options.videoElement);
          this.options.onConnectionChange?.('connected');
        }
      }

      if (mediaType === 'audio') {
        this.remoteAudioTrack = user.audioTrack ?? null;
        if (this.remoteAudioTrack) {
          this.remoteAudioTrack.play();
          console.log('[AKOOL] Audio track playing');
        }
      }
    });

    this.client.on('user-unpublished', (user, mediaType) => {
      console.log('[AKOOL] user-unpublished:', user.uid, mediaType);
    });

    if (this._destroyed) return;
    await this.client.join(appId, channel, token || null, null);
    console.log('[AKOOL] Joined Agora channel. Remote users:', this.client.remoteUsers.map(u => u.uid));
  }

  attachVideo(el: HTMLVideoElement): void {
    this.options.videoElement = el;
    if (this.remoteVideoTrack) {
      this.remoteVideoTrack.stop();
      this.remoteVideoTrack.play(el);
    }
  }

  /**
   * Send TTS text to AKOOL via Agora data stream.
   * Agora 1KB message limit → chunk text at 800 chars.
   * sendStreamMessage is not in public types but exists in the SDK.
   */
  async speak(text: string): Promise<void> {
    if (this.isMockMode || !this.client || this._destroyed) return;

    const CHUNK_SIZE = 800;
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE));
    }

    for (let idx = 0; idx < chunks.length; idx++) {
      const msg = {
        v: 2,
        type: 'chat',
        mid: `msg-${Date.now()}-${idx}`,
        idx,
        fin: idx === chunks.length - 1,
        pld: { text: chunks[idx] },
      };
      try {
        await (this.client as any).sendStreamMessage(JSON.stringify(msg), false);
        console.log(`[AKOOL] TTS chunk ${idx + 1}/${chunks.length} sent:`, chunks[idx].slice(0, 40));
      } catch (e) {
        console.warn('[AKOOL] sendStreamMessage failed:', e);
      }
    }
  }

  async interrupt(): Promise<void> {
    if (!this.client || this._destroyed) return;
    const msg = { v: 2, type: 'command', mid: `msg-${Date.now()}`, pld: { cmd: 'interrupt' } };
    try {
      await (this.client as any).sendStreamMessage(JSON.stringify(msg), false);
    } catch (e) {
      console.warn('[AKOOL] interrupt failed:', e);
    }
  }

  async destroy(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._statusPoller) {
      clearInterval(this._statusPoller);
      this._statusPoller = null;
    }

    if (!this.isMockMode && this.akoolSessionId) {
      try {
        await api.closeAvatarSession(this.akoolSessionId, this.options.sessionId);
      } catch { /* best-effort */ }
    }

    this.remoteVideoTrack?.stop();
    this.remoteAudioTrack?.stop();

    if (!this.isMockMode && this.client) {
      try { await this.client.leave(); } catch { /* best-effort */ }
    }

    this.options.onConnectionChange?.('disconnected');
    this.akoolSessionId = null;

    // Only release the singleton slot if we still own it
    if (_instance === this) _instance = null;
  }

  get isLive(): boolean {
    return !this.isMockMode && !this._destroyed && this.akoolSessionId !== null;
  }
}
