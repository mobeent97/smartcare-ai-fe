import { api } from './api';
import { AgoraStub } from './agora';

interface AvatarManagerOptions {
  sessionId: string;
  avatarType?: 'nurse' | 'doctor';
  onReady?: () => void;
  onError?: (error: Error) => void;
}

export class AKOOLAvatarManager {
  private sessionId: string;
  private avatarType: 'nurse' | 'doctor';
  private akoolSessionId: string | null = null;
  private agora: AgoraStub | null = null;
  private isMockMode = false;
  private onReady?: () => void;
  private onError?: (error: Error) => void;

  constructor(options: AvatarManagerOptions) {
    this.sessionId = options.sessionId;
    this.avatarType = options.avatarType ?? 'nurse';
    this.onReady = options.onReady;
    this.onError = options.onError;
  }

  async initialize(): Promise<{ akoolSessionId: string; mode: 'live' | 'mock' }> {
    try {
      const response = await api.createAvatarSession(this.sessionId, this.avatarType);
      const data = response.data;
      this.akoolSessionId = data.session_id;
      this.isMockMode = data.mode === 'mock';

      if (!this.isMockMode) {
        // TODO: Replace AgoraStub with real AgoraRTC client when AGORA_APP_ID is available
        this.agora = new AgoraStub(
          process.env.NEXT_PUBLIC_AGORA_APP_ID ?? '',
          data.agora_channel,
          data.agora_uid
        );
        await this.agora.join('');
      }

      this.onReady?.();
      return { akoolSessionId: this.akoolSessionId, mode: data.mode };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError?.(err);
      throw err;
    }
  }

  async destroy(): Promise<void> {
    await this.agora?.leave();
    this.akoolSessionId = null;
  }

  get isLive(): boolean {
    return !this.isMockMode && this.akoolSessionId !== null;
  }

  get sessionId_akool(): string | null {
    return this.akoolSessionId;
  }
}
