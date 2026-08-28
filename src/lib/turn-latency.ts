// Turn-latency instrumentation for the realtime booth.
//
// Answers one question per turn: how long did the patient wait between
// finishing their sentence and hearing the nurse start speaking, and which
// component ate that time. Every span is a wall-clock delta between two events
// we already receive — nothing here polls, samples, or estimates.
//
// Spans recorded per turn:
//   speech_stop → first_audio   total perceived latency (the number that matters)
//   tool:<name>               each tool round trip, summed into tool_ms
//   speech_stop → response_start  server-side think time before generation
//
// Plus one cold-start timeline per session (mint / mic / SDP / data channel),
// because time-to-first-word is judged separately from per-turn latency.
//
// Results go to streamLog, so they land in logs/avatar_stream_fe.log next to
// the backend timeline and can be diffed against it.

import { streamLog } from './stream-log';

export interface TurnSummary {
  /** End of patient speech → first audio out. The perceived latency. */
  totalMs: number | null;
  /** Server think time before the response began generating. */
  thinkMs: number | null;
  /** Wall-clock spent inside tool round trips during this turn. */
  toolMs: number;
  /** Per-tool breakdown, in call order. */
  tools: { name: string; ms: number }[];
}

type ColdMark =
  | 'page_mount'
  | 'mint_start'
  | 'mint_done'
  | 'mic_start'
  | 'mic_ready'
  | 'sdp_start'
  | 'sdp_done'
  | 'dc_open'
  | 'first_audio';

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export class LatencyTracker {
  private sessionId: string;

  // ── cold start ──
  private cold = new Map<ColdMark, number>();
  private coldFlushed = false;

  // ── current turn ──
  private speechStopAt: number | null = null;
  private responseStartAt: number | null = null;
  private firstAudioAt: number | null = null;
  private openTools = new Map<string, number>();
  private turnTools: { name: string; ms: number }[] = [];
  private turnFlushed = true;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.coldMark('page_mount');
  }

  // ─── cold start ─────────────────────────────────────────────────────────
  coldMark(mark: ColdMark): void {
    if (this.cold.has(mark)) return; // first occurrence wins; reconnects don't overwrite
    this.cold.set(mark, now());
    if (mark === 'first_audio') this.flushCold();
  }

  private span(a: ColdMark, b: ColdMark): number | null {
    const ta = this.cold.get(a);
    const tb = this.cold.get(b);
    if (ta === undefined || tb === undefined) return null;
    return Math.round(tb - ta);
  }

  private flushCold(): void {
    if (this.coldFlushed) return;
    this.coldFlushed = true;
    streamLog(this.sessionId, 'COLD_START', {
      mint_ms: this.span('mint_start', 'mint_done'),
      mic_ms: this.span('mic_start', 'mic_ready'),
      sdp_ms: this.span('sdp_start', 'sdp_done'),
      dc_open_ms: this.span('sdp_done', 'dc_open'),
      greeting_ms: this.span('dc_open', 'first_audio'),
      total_ms: this.span('page_mount', 'first_audio'),
    });
  }

  // ─── per turn ───────────────────────────────────────────────────────────
  /** Patient stopped speaking — the clock the patient actually feels starts here. */
  speechStop(): void {
    // A new turn begins; anything left unflushed belongs to the previous one.
    this.speechStopAt = now();
    this.responseStartAt = null;
    this.firstAudioAt = null;
    this.turnTools = [];
    this.openTools.clear();
    this.turnFlushed = false;
  }

  responseStart(): void {
    if (this.responseStartAt === null) this.responseStartAt = now();
  }

  /** First audio of this turn reached the patient. Later calls are ignored. */
  firstAudio(): void {
    if (this.firstAudioAt === null) this.firstAudioAt = now();
    this.coldMark('first_audio');
  }

  toolStart(name: string): void {
    this.openTools.set(name, now());
  }

  toolEnd(name: string): void {
    const started = this.openTools.get(name);
    if (started === undefined) return;
    this.openTools.delete(name);
    this.turnTools.push({ name, ms: Math.round(now() - started) });
  }

  /** Compute the turn without emitting — for the on-screen debug panel. */
  summary(): TurnSummary {
    const toolMs = this.turnTools.reduce((a, t) => a + t.ms, 0);
    return {
      totalMs:
        this.speechStopAt !== null && this.firstAudioAt !== null
          ? Math.round(this.firstAudioAt - this.speechStopAt)
          : null,
      thinkMs:
        this.speechStopAt !== null && this.responseStartAt !== null
          ? Math.round(this.responseStartAt - this.speechStopAt)
          : null,
      toolMs,
      tools: this.turnTools.slice(),
    };
  }

  /** Emit the turn. Safe to call more than once per turn — only the first wins. */
  flushTurn(): TurnSummary | null {
    if (this.turnFlushed || this.speechStopAt === null) return null;
    this.turnFlushed = true;
    const s = this.summary();
    streamLog(this.sessionId, 'TURN_LATENCY', {
      total_ms: s.totalMs,
      think_ms: s.thinkMs,
      tool_ms: s.toolMs,
      tools: s.tools.map((t) => `${t.name}=${t.ms}ms`).join(' ') || 'none',
    });
    return s;
  }
}
