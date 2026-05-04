import { api } from './api';

export type VideoState = 'idle' | 'speaking' | 'listening';

// ─── TTS Blob Cache ────────────────────────────────────────────────────────────
const _ttsCache = new Map<string, Blob>();

export async function prefetchTts(texts: string[]): Promise<void> {
  await Promise.all(
    texts.map(async (text) => {
      if (_ttsCache.has(text) || !text.trim()) return;
      try {
        const blob = await api.ttsSpeak(text);
        _ttsCache.set(text, blob);
      } catch { /* ignore — avatar page will re-fetch on demand */ }
    })
  );
}

interface VideoAvatarOptions {
  onStateChange?: (state: VideoState) => void;
}

let _instance: VideoAvatarManager | null = null;

export function getAvatarManager(): VideoAvatarManager | null {
  return _instance;
}

export class VideoAvatarManager {
  private _destroyed = false;
  private _audio: HTMLAudioElement | null = null;
  private _options: VideoAvatarOptions;

  constructor(options: VideoAvatarOptions = {}) {
    this._options = options;
    if (_instance && _instance !== this) {
      _instance.destroy();
    }
    _instance = this;
  }

  async speak(text: string): Promise<void> {
    if (this._destroyed || !text.trim()) return;
    try {
      const blob = _ttsCache.get(text) ?? await api.ttsSpeak(text);
      _ttsCache.delete(text);
      if (this._destroyed) return;
      // Switch to speaking video only after audio blob is ready — eliminates visual/audio desync
      this._setState('speaking');
      await this._playBlob(blob);
    } catch {
      // silently handle network errors or destroy-during-playback
    } finally {
      if (!this._destroyed) this._setState('idle');
    }
  }

  private _playBlob(blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._destroyed) return resolve();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this._audio = audio;
      audio.onended = () => { URL.revokeObjectURL(url); this._audio = null; resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); this._audio = null; reject(new Error('audio playback failed')); };
      audio.play().catch(reject);
    });
  }

  showListening(): void {
    if (this._audio) { this._audio.pause(); this._audio = null; }
    this._setState('listening');
  }

  showIdle(): void {
    this._setState('idle');
  }

  private _setState(state: VideoState): void {
    if (this._destroyed) return;
    this._options.onStateChange?.(state);
  }

  destroy(): void {
    this._destroyed = true;
    this._audio?.pause();
    this._audio = null;
    if (_instance === this) _instance = null;
  }
}
