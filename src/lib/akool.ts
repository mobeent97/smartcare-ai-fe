import type { IAgoraRTCClient, IRemoteVideoTrack, IRemoteAudioTrack } from 'agora-rtc-sdk-ng';
import { api } from './api';

interface AvatarManagerOptions {
  sessionId: string;
  avatarType?: 'nurse' | 'doctor';
  videoElement: HTMLVideoElement;
  onConnectionChange?: (state: 'connecting' | 'connected' | 'disconnected') => void;
  onError?: (error: Error) => void;
}

// Module-level singleton — persists across page navigations
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

  constructor(options: AvatarManagerOptions) {
    this.options = options;
    _instance = this;
  }

  async initialize(): Promise<{ akoolSessionId: string; mode: 'live' | 'mock' }> {
    this.options.onConnectionChange?.('connecting');
    try {
      const response = await api.createAvatarSession(
        this.options.sessionId,
        this.options.avatarType ?? 'nurse'
      );
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
          data.agora_channel,
          data.agora_token ?? '',
          data.agora_uid ?? 12345
        );
        // 'connected' fires from user-published when AKOOL starts streaming (10–30s)
      }
      return { akoolSessionId: this.akoolSessionId!, mode: data.mode };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[AKOOL] initialize error:', err);
      this.options.onError?.(err);
      throw err;
    }
  }

  /** Poll AKOOL session status every 5s so we can see when it reaches status 3 (streaming). */
  private _startStatusPoller(): void {
    if (!this.akoolSessionId) return;
    let attempts = 0;
    this._statusPoller = setInterval(async () => {
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
          console.warn('[AKOOL] Status poll timeout — session never reached status 3 after 2 min');
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
    console.log(`[AKOOL] Connecting Agora — appId=${appId.slice(0,8)}… channel=${channel} uid=${uid} token=${token ? 'present' : 'EMPTY'}`);

    const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
    AgoraRTC.setLogLevel(0); // verbose Agora SDK logs

    // Try h264 first — AKOOL's streaming engine typically publishes H264
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

    // Register BEFORE join so we never miss an early publish event
    this.client.on('user-published', async (user, mediaType) => {
      console.log(`[AKOOL] user-published uid=${user.uid} mediaType=${mediaType}`);
      console.log('[AKOOL] user-published full user object:', JSON.stringify({
        uid: user.uid,
        hasAudio: user.hasAudio,
        hasVideo: user.hasVideo,
        audioTrack: !!user.audioTrack,
        videoTrack: !!user.videoTrack,
      }));

      try {
        await this.client!.subscribe(user, mediaType);
        console.log(`[AKOOL] Subscribed to ${mediaType} from uid=${user.uid}`);
      } catch (e) {
        console.error(`[AKOOL] Subscribe error for ${mediaType}:`, e);
        return;
      }

      if (mediaType === 'video') {
        this.remoteVideoTrack = user.videoTrack ?? null;
        console.log('[AKOOL] Video track after subscribe:', this.remoteVideoTrack);
        console.log('[AKOOL] Target video element:', this.options.videoElement);
        console.log('[AKOOL] Video element in DOM:', document.body.contains(this.options.videoElement));

        if (this.remoteVideoTrack) {
          try {
            this.remoteVideoTrack.play(this.options.videoElement);
            console.log('[AKOOL] Video track.play() called successfully');
          } catch (e) {
            console.error('[AKOOL] Video track.play() error:', e);
          }
          this.options.onConnectionChange?.('connected');
        } else {
          console.error('[AKOOL] user.videoTrack is null after subscribe — cannot play video');
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

    await this.client.join(appId, channel, token || null, uid);
    console.log('[AKOOL] Joined Agora channel. Remote users already in channel:', this.client.remoteUsers.map(u => u.uid));
    // createDataStream does not exist in Agora Web SDK v4.x — speak() uses AKOOL REST API instead
  }

  /** Re-attach the live video track to a new DOM element (called on each page mount). */
  attachVideo(el: HTMLVideoElement): void {
    this.options.videoElement = el;
    if (this.remoteVideoTrack) {
      console.log('[AKOOL] Re-attaching video track to new element');
      this.remoteVideoTrack.stop();
      this.remoteVideoTrack.play(el);
    }
  }

  async speak(text: string, sessionId?: string): Promise<void> {
    if (this.isMockMode || !this.akoolSessionId) return;
    // AKOOL text-to-speech via REST API (Agora data streams removed in SDK v4.x)
    try {
      await api.sendAvatarMessage(this.akoolSessionId, text, sessionId ?? '');
    } catch (e) {
      console.warn('[AKOOL] speak() REST call failed:', e);
    }
  }

  async destroy(): Promise<void> {
    if (this._statusPoller) {
      clearInterval(this._statusPoller);
      this._statusPoller = null;
    }
    this.remoteVideoTrack?.stop();
    this.remoteAudioTrack?.stop();
    if (!this.isMockMode && this.client) {
      await this.client.leave();
    }
    this.options.onConnectionChange?.('disconnected');
    this.akoolSessionId = null;
    _instance = null;
  }

  get isLive(): boolean {
    return !this.isMockMode && this.akoolSessionId !== null;
  }

  get sessionId_akool(): string | null {
    return this.akoolSessionId;
  }
}
