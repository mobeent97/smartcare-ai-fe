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

// Warm up browser audio subsystem on user gesture (eliminates first-play stutter)
export function prewarmAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new AudioContext();
    ctx.close();
  } catch { /* unsupported */ }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoAvatarOptions {
  onStateChange?: (state: VideoState) => void;
  onWaveform?: (data: Float32Array) => void;
  onSubtitle?: (text: string) => void;
}

let _instance: VideoAvatarManager | null = null;

export function getAvatarManager(): VideoAvatarManager | null {
  return _instance;
}

// ─── Manager ──────────────────────────────────────────────────────────────────

export class VideoAvatarManager {
  private _destroyed = false;
  private _audio: HTMLAudioElement | null = null;
  private _audioCtx: AudioContext | null = null;
  private _analyser: AnalyserNode | null = null;
  private _rafId: number | null = null;
  private _subtitleTimer: ReturnType<typeof setInterval> | null = null;
  private _options: VideoAvatarOptions;

  constructor(options: VideoAvatarOptions = {}) {
    this._options = options;
    if (_instance && _instance !== this) {
      _instance.destroy();
    }
    _instance = this;
  }

  // ── Sentence splitting ──────────────────────────────────────────────────────

  private _splitSentences(text: string): string[] {
    const parts = text.match(/[^.!?]+[.!?]+\s*/g);
    if (!parts || parts.length <= 1) return [text];
    return parts.map(s => s.trim()).filter(Boolean);
  }

  // ── Main speak ──────────────────────────────────────────────────────────────

  async speak(text: string): Promise<void> {
    if (this._destroyed || !text.trim()) return;
    try {
      // Full cache hit (pre-fetched on consent page) — play immediately
      if (_ttsCache.has(text)) {
        const blob = _ttsCache.get(text)!;
        _ttsCache.delete(text);
        if (this._destroyed) return;
        this._setState('speaking');
        await this._playBlob(blob, text);
        return;
      }

      // No cache — pipeline sentences to reduce perceived latency
      const sentences = this._splitSentences(text);
      this._setState('speaking');

      let pending: Promise<Blob> | null = null;

      for (let i = 0; i < sentences.length; i++) {
        if (this._destroyed) return;

        // Pre-fetch next sentence while current loads
        if (i + 1 < sentences.length && pending === null) {
          pending = api.ttsSpeak(sentences[i + 1]);
        }

        const blob = i === 0
          ? await api.ttsSpeak(sentences[i])
          : await (pending ?? api.ttsSpeak(sentences[i]));

        pending = null;

        // Pre-fetch sentence after next
        if (i + 2 < sentences.length) {
          pending = api.ttsSpeak(sentences[i + 2]);
        }

        if (this._destroyed) return;
        await this._playBlob(blob, sentences[i]);
        if (this._destroyed) return;
      }
    } catch {
      // silently handle network errors or destroy-during-playback
    } finally {
      if (!this._destroyed) this._setState('idle');
    }
  }

  // ── Interrupt (tap video to stop speaking and switch to listening) ──────────

  interrupt(): void {
    if (this._audio) {
      this._audio.pause();
      this._audio = null;
    }
    this._stopSubtitles();
    this._stopAnalyser();
    this._setState('listening');
  }

  showListening(): void {
    if (this._audio) { this._audio.pause(); this._audio = null; }
    this._stopSubtitles();
    this._stopAnalyser();
    this._setState('listening');
  }

  showIdle(): void {
    this._setState('idle');
  }

  // ── Blob playback with waveform + subtitles ─────────────────────────────────

  private _playBlob(blob: Blob, text = ''): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._destroyed) return resolve();

      this._stopAnalyser();

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this._audio = audio;

      this._setupAnalyser(audio);
      if (text) this._startSubtitles(text);

      audio.onended = () => {
        URL.revokeObjectURL(url);
        this._audio = null;
        this._stopSubtitles();
        this._stopAnalyser();
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        this._audio = null;
        this._stopSubtitles();
        this._stopAnalyser();
        reject(new Error('audio playback failed'));
      };
      audio.play().catch(reject);
    });
  }

  // ── Web Audio AnalyserNode for real waveform ────────────────────────────────

  private _setupAnalyser(audio: HTMLAudioElement): void {
    if (!this._options.onWaveform) return;
    try {
      const ctx = new AudioContext();
      this._audioCtx = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      analyser.smoothingTimeConstant = 0.8;
      this._analyser = analyser;
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      const data = new Float32Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!this._analyser || this._destroyed) return;
        this._analyser.getFloatFrequencyData(data);
        this._options.onWaveform!(data);
        this._rafId = requestAnimationFrame(tick);
      };
      this._rafId = requestAnimationFrame(tick);
    } catch { /* AudioContext unavailable (SSR, restricted env) */ }
  }

  private _stopAnalyser(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._analyser = null;
    if (this._audioCtx) {
      this._audioCtx.close().catch(() => {});
      this._audioCtx = null;
    }
  }

  // ── Subtitle timing ─────────────────────────────────────────────────────────

  private _startSubtitles(text: string): void {
    if (!this._options.onSubtitle) return;
    const words = text.split(/\s+/);
    let idx = 0;
    const MS_PER_WORD = 380; // ~158 wpm
    this._subtitleTimer = setInterval(() => {
      if (idx >= words.length) {
        clearInterval(this._subtitleTimer!);
        this._subtitleTimer = null;
        return;
      }
      this._options.onSubtitle!(words.slice(0, ++idx).join(' '));
    }, MS_PER_WORD);
  }

  private _stopSubtitles(): void {
    if (this._subtitleTimer) {
      clearInterval(this._subtitleTimer);
      this._subtitleTimer = null;
    }
    this._options.onSubtitle?.('');
  }

  // ── Internal state ──────────────────────────────────────────────────────────

  private _setState(state: VideoState): void {
    if (this._destroyed) return;
    this._options.onStateChange?.(state);
  }

  destroy(): void {
    this._destroyed = true;
    this._audio?.pause();
    this._audio = null;
    this._stopSubtitles();
    this._stopAnalyser();
    if (_instance === this) _instance = null;
  }
}
