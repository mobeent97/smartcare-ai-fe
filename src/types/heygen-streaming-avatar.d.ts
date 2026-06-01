// Minimal ambient typing for @heygen/streaming-avatar covering only the API
// surface used by src/lib/heygen.ts. The published package's bundled types are
// not always present in every install, so this guarantees a clean compile. Our
// usage is a strict subset of the real SDK, so it stays runtime-correct.
declare module '@heygen/streaming-avatar' {
  export enum AvatarQuality {
    Low = 'low',
    Medium = 'medium',
    High = 'high',
  }

  export enum StreamingEvents {
    STREAM_READY = 'stream_ready',
    STREAM_DISCONNECTED = 'stream_disconnected',
    AVATAR_START_TALKING = 'avatar_start_talking',
    AVATAR_STOP_TALKING = 'avatar_stop_talking',
  }

  export enum TaskType {
    TALK = 'talk',
    REPEAT = 'repeat',
  }

  export enum TaskMode {
    SYNC = 'sync',
    ASYNC = 'async',
  }

  export interface StartAvatarRequest {
    quality?: AvatarQuality;
    avatarName: string;
    voice?: { voiceId?: string; rate?: number };
    knowledgeId?: string;
    language?: string;
  }

  export interface SpeakRequest {
    text: string;
    taskType?: TaskType;
    taskMode?: TaskMode;
  }

  export default class StreamingAvatar {
    constructor(config: { token: string; basePath?: string });
    on(event: StreamingEvents, listener: (event: { detail?: unknown }) => void): void;
    createStartAvatar(request: StartAvatarRequest): Promise<unknown>;
    speak(request: SpeakRequest): Promise<unknown>;
    stopAvatar(): Promise<unknown>;
    interrupt(): Promise<unknown>;
  }
}
