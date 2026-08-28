/**
 * OpenAI Realtime WebRTC client.
 *
 * Architecture:
 *   1. Backend mints ephemeral session token (POST /triage/realtime/session/)
 *   2. Browser opens RTCPeerConnection, captures mic, adds audio track
 *   3. Browser sends SDP offer to OpenAI Realtime endpoint with ephemeral key
 *   4. OpenAI returns SDP answer, peer connection establishes
 *   5. Audio flows bidirectionally; events flow over a DataChannel
 *
 * Tool calls from the model are emitted as `response.function_call_arguments.done`
 * events. We dispatch them to backend REST endpoints, then send the result back
 * to the model via `conversation.item.create` + `response.create`.
 *
 * PHI handling: this module logs only event types, never event payloads.
 */

export type DeviceProfile = 'handheld' | 'kiosk';

/** Phone held to the face vs. a kiosk across the room. The backend tunes the
 *  server-side noise reduction to match; `kiosk` is the safe default. */
export function detectDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined') return 'kiosk';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse && window.innerWidth < 900 ? 'handheld' : 'kiosk';
}

/** getUserMedia refused or unavailable. Distinguished so the page can say
 *  "microphone access is needed" instead of a generic connection error, and
 *  so reconnect attempts (pointless here) are skipped. */
export class MicPermissionError extends Error {
  constructor(public readonly cause_name: string) {
    super('Microphone access is needed for the voice assistant');
    this.name = 'MicPermissionError';
  }
}

export interface RealtimeSessionMint {
  client_secret: string;
  expires_at: number;
  realtime_session_id: string;
  model: string;
  /** SDP-exchange endpoint for the provider that minted this key. Supplied by
   *  the backend so the host can never disagree with the key. Absent on an
   *  older backend, in which case the OpenAI default below applies. */
  webrtc_url?: string;
}

export interface RealtimeCallbacks {
  onConnected: () => void;
  onDisconnected: (reason?: string) => void;
  onUserTranscript: (text: string, isFinal: boolean) => void;
  onAssistantTranscript: (text: string) => void;
  onResponseStart: () => void;
  onSpeakingStart: () => void;
  onSpeakingStop: () => void;
  /** Model finished generating. `hadAudio` = true if the response produced
   *  spoken output. Use this to schedule a playback-drain timer. */
  onResponseComplete: (hadAudio: boolean) => void;
  /** User started talking (VAD). UI should show "listening". */
  onUserSpeechStart: () => void;
  /** User stopped talking, model is processing. UI should show "thinking". */
  onUserSpeechStop: () => void;
  /** The user barged in while the model was speaking — the server cleared the
   *  output audio buffer (output_audio_buffer.cleared). UI should drop straight
   *  back to "listening". */
  onBargeIn?: () => void;
  onError: (msg: string) => void;
  /** Raw RTCPeerConnection state. 'disconnected' is TRANSIENT — ICE is
   *  probing and usually recovers within seconds; only 'failed'/'closed'
   *  trigger onDisconnected. Lets the page show "Reconnecting…" instead of
   *  tearing the session down on a Wi-Fi blip. */
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  /** The model went silent when it should have spoken, and the client is
   *  re-prompting it. `attempt` is 1-based. Diagnostic only — the recovery is
   *  automatic. */
  onStall?: (attempt: number) => void;
  /** The patient stopped talking but the server never opened a response, so
   *  the client committed the audio and asked for one itself. Diagnostic —
   *  the patient sees nothing. */
  onTurnForced?: (attempt: number) => void;
  onAudioElement: (el: HTMLAudioElement) => void;
  /** Connection-setup checkpoints, for cold-start instrumentation. Fired as
   *  each stage of connect() begins and ends so the page can see which stage
   *  owns the time before the first word. */
  onPhaseMark?: (mark: string) => void;
}

/** Structured values the model can hand over alongside the raw answer, so the
 *  server never has to run an LLM parse while the model waits on the response. */
export interface AnswerExtras {
  symptoms?: string[];
  patient_name?: string;
  patient_age?: number;
  patient_sex?: string;
}

export interface ToolDispatcher {
  submit_answer: (args: { step: string; value: string } & AnswerExtras) => Promise<unknown>;
  update_answer: (args: { step: string; value: string } & AnswerExtras) => Promise<unknown>;
  trigger_measurement: (args: { device_type: string }) => Promise<unknown>;
  flag_emergency: (args: { reason: string }) => Promise<unknown>;
  complete_triage: (args: Record<string, never>) => Promise<unknown>;
}

// ─── Pre-connect relays ─────────────────────────────────────────────────────
// A client can be connected while the patient is still on the consent screen,
// before the booth page (and its callbacks) exists. These stand in for the
// page until attach(): events are buffered and replayed in order, tool calls
// wait. Nothing is dropped.

const RELAYED_EVENTS = [
  'onConnected', 'onDisconnected', 'onUserTranscript', 'onAssistantTranscript',
  'onResponseStart', 'onSpeakingStart', 'onSpeakingStop', 'onResponseComplete',
  'onUserSpeechStart', 'onUserSpeechStop', 'onBargeIn', 'onError',
  'onConnectionStateChange', 'onStall', 'onTurnForced', 'onAudioElement', 'onPhaseMark',
] as const;

export class CallbackRelay implements RealtimeCallbacks {
  private target: RealtimeCallbacks | null = null;
  private queue: Array<{ name: keyof RealtimeCallbacks; args: unknown[] }> = [];

  // Required members of RealtimeCallbacks — assigned in the constructor loop.
  onConnected!: RealtimeCallbacks['onConnected'];
  onDisconnected!: RealtimeCallbacks['onDisconnected'];
  onUserTranscript!: RealtimeCallbacks['onUserTranscript'];
  onAssistantTranscript!: RealtimeCallbacks['onAssistantTranscript'];
  onResponseStart!: RealtimeCallbacks['onResponseStart'];
  onSpeakingStart!: RealtimeCallbacks['onSpeakingStart'];
  onSpeakingStop!: RealtimeCallbacks['onSpeakingStop'];
  onResponseComplete!: RealtimeCallbacks['onResponseComplete'];
  onUserSpeechStart!: RealtimeCallbacks['onUserSpeechStart'];
  onUserSpeechStop!: RealtimeCallbacks['onUserSpeechStop'];
  onError!: RealtimeCallbacks['onError'];
  onAudioElement!: RealtimeCallbacks['onAudioElement'];
  onBargeIn?: RealtimeCallbacks['onBargeIn'];
  onConnectionStateChange?: RealtimeCallbacks['onConnectionStateChange'];
  onStall?: RealtimeCallbacks['onStall'];
  onTurnForced?: RealtimeCallbacks['onTurnForced'];
  onPhaseMark?: RealtimeCallbacks['onPhaseMark'];

  constructor() {
    for (const name of RELAYED_EVENTS) {
      (this as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
        const fn = this.target?.[name] as ((...a: unknown[]) => void) | undefined;
        if (this.target) fn?.(...args);
        else this.queue.push({ name, args });
      };
    }
  }

  attach(target: RealtimeCallbacks): void {
    this.target = target;
    const pending = this.queue;
    this.queue = [];
    for (const { name, args } of pending) {
      const fn = target[name] as ((...a: unknown[]) => void) | undefined;
      fn?.(...args);
    }
  }
}

export class ToolRelay implements ToolDispatcher {
  private target: ToolDispatcher | null = null;
  private waiters: Array<() => void> = [];

  private ready(): Promise<void> {
    if (this.target) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private relay<K extends keyof ToolDispatcher>(name: K): ToolDispatcher[K] {
    return (async (args: unknown) => {
      await this.ready();
      return (this.target![name] as (a: unknown) => Promise<unknown>)(args);
    }) as ToolDispatcher[K];
  }

  submit_answer = this.relay('submit_answer');
  update_answer = this.relay('update_answer');
  trigger_measurement = this.relay('trigger_measurement');
  flag_emergency = this.relay('flag_emergency');
  complete_triage = this.relay('complete_triage');

  attach(target: ToolDispatcher): void {
    this.target = target;
    const w = this.waiters;
    this.waiters = [];
    w.forEach((resolve) => resolve());
  }
}

// GA SDP exchange endpoint. The beta `/v1/realtime?model=...` route was
// replaced by `/v1/realtime/calls` (model is baked into the ephemeral key).
const DEFAULT_REALTIME_URL = 'https://api.openai.com/v1/realtime/calls';

// How long to wait for the model to start responding after we asked it to,
// before assuming the turn is wedged. Normal time-to-first-token is a few
// hundred ms, so this only fires on a genuine fault.
const RESPONSE_STALL_MS = 4000;
// Cap the retries so a persistently broken session surfaces an error instead
// of looping response.create forever.
const MAX_STALL_RETRIES = 2;

// How long after the patient stops talking we wait for the SERVER to open a
// response before forcing the turn ourselves. semantic_vad holds a turn open
// until it judges the utterance complete; a distressed patient who trails off
// ("it hurts… here… since…") can never satisfy that, and the booth sits in
// "thinking" forever. 3s is long enough for a slow speaker's natural pause,
// short enough that a stall reads as a beat, not a fault.
const TURN_FORCE_MS = 3000;
const MAX_TURN_FORCES = 2;

export class RealtimeClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private destroyed = false;
  // Tracks whether the in-flight response has emitted any audio. Tool-call-only
  // responses emit response.done with no audio — we must not flip phase to
  // "listening" in that case (the model will immediately start a new response).
  private currentResponseHasAudio = false;
  // GA WebRTC emits output_audio_buffer.started/stopped/cleared — exact
  // playback boundaries. Once seen, the page can skip its transcript-length
  // playback estimator and trust onSpeakingStop from the .stopped event.
  private playbackEventsSeen = false;
  // response.create while a response is still active errors ("conversation
  // already has an active response"). Track active state; if a tool result
  // lands mid-response, defer the create until response.done.
  //
  // This flag is set optimistically when we send a create, because a second
  // tool finishing before the server's response.created round trip would
  // otherwise double-create. That optimism is also how the session used to
  // wedge: if the server REJECTED our create, neither response.created nor
  // response.done ever arrived, the flag stayed true forever, and every later
  // tool result deferred to a response.done that would never come. The booth
  // went silent until the patient spoke again (their voice creates a response
  // server-side). Hence the watchdog below — nothing is allowed to leave the
  // nurse permanently mute.
  private responseActive = false;
  private pendingResponseCreate = false;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private stallRetries = 0;
  // Server-VAD path: the server is supposed to create the response after the
  // patient's turn. Nothing above covers the case where it simply doesn't.
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private turnForces = 0;

  constructor(
    private mint: RealtimeSessionMint,
    private callbacks: RealtimeCallbacks,
    private tools: ToolDispatcher,
  ) {}

  /** Swap in the real page callbacks/tools on a client that was connected
   *  ahead of time (see realtime-prewarm). Anything the relay buffered while
   *  no page was listening is replayed to the new target. */
  attach(callbacks: RealtimeCallbacks, tools: ToolDispatcher): void {
    if (this.callbacks instanceof CallbackRelay) this.callbacks.attach(callbacks);
    else this.callbacks = callbacks;
    if (this.tools instanceof ToolRelay) this.tools.attach(tools);
    else this.tools = tools;
  }

  get isConnected(): boolean {
    return this.dc?.readyState === 'open';
  }

  /** True once the server has emitted output_audio_buffer.* events — playback
   *  boundaries are exact and the caller can skip duration estimation. */
  get hasPlaybackEvents(): boolean {
    return this.playbackEventsSeen;
  }

  /** Returns seconds remaining on the ephemeral key. */
  secondsUntilExpiry(): number {
    if (!this.mint.expires_at) return Infinity;
    return Math.floor(this.mint.expires_at - Date.now() / 1000);
  }

  async connect(): Promise<void> {
    if (this.destroyed) throw new Error('client destroyed');

    // Reject obviously stale mints up front — the SDP exchange would 401
    // anyway, but this gives a clearer error for the page to retry on.
    const remaining = this.secondsUntilExpiry();
    if (remaining < 10) {
      throw new Error(`mint expired or about to expire (${remaining}s remaining)`);
    }

    this.pc = new RTCPeerConnection();

    // Remote audio playback
    this.audioEl = document.createElement('audio');
    this.audioEl.autoplay = true;
    this.pc.ontrack = (e) => {
      if (this.audioEl && e.streams[0]) {
        this.audioEl.srcObject = e.streams[0];
        this.callbacks.onAudioElement(this.audioEl);
      }
    };

    // Local mic
    this.callbacks.onPhaseMark?.('mic_start');
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      throw new MicPermissionError((e as { name?: string })?.name ?? 'UnknownError');
    }
    this.callbacks.onPhaseMark?.('mic_ready');
    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    // Data channel for events
    this.dc = this.pc.createDataChannel('oai-events');
    this.dc.onopen = () => {
      this.callbacks.onPhaseMark?.('dc_open');
      this.callbacks.onConnected();
    };
    this.dc.onmessage = (e) => this.handleServerEvent(e.data);
    this.dc.onclose = () => this.callbacks.onDisconnected('data channel closed');

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      const st = this.pc.connectionState;
      this.callbacks.onConnectionStateChange?.(st);
      if (st === 'failed' || st === 'closed') {
        this.callbacks.onDisconnected(st);
      }
    };

    // SDP exchange with OpenAI Realtime
    this.callbacks.onPhaseMark?.('sdp_start');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const resp = await fetch(this.mint.webrtc_url || DEFAULT_REALTIME_URL, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${this.mint.client_secret}`,
        'Content-Type': 'application/sdp',
      },
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Realtime SDP exchange failed: ${resp.status} ${errText.slice(0, 200)}`);
    }
    const answerSdp = await resp.text();
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    this.callbacks.onPhaseMark?.('sdp_done');
  }

  /** Tell the model to start the conversation. */
  startConversation(): void {
    this.send({ type: 'response.create' });
  }

  /** Gate the mic track. Hybrid mode disables it while the live avatar speaks
   *  through the kiosk speaker — otherwise the model hears its own lines as
   *  "user speech" (echo cancellation doesn't cover a separate audio path)
   *  and produces ghost turns. Track stays live (no renegotiation); disabled
   *  tracks transmit silence. */
  setMicEnabled(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => { t.enabled = enabled; });
  }

  private handleServerEvent(raw: string): void {
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    const type = evt.type as string;

    switch (type) {
      case 'input_audio_buffer.speech_started':
        // Patient is (still) talking: a turn is not over, so do not force one.
        this.clearTurnWatchdog();
        this.turnForces = 0;
        this.callbacks.onUserSpeechStart();
        break;
      case 'input_audio_buffer.speech_stopped':
        // From here the server owes us a response. Start the clock.
        this.armTurnWatchdog();
        this.callbacks.onUserSpeechStop();
        break;
      case 'input_audio_buffer.committed':
        // Committed but not yet responded — keep the clock running; it is
        // cleared by response.created.
        this.callbacks.onUserSpeechStop();
        break;
      case 'response.created':
        this.currentResponseHasAudio = false;
        this.responseActive = true;
        // The model is responding — nothing is stuck on either path.
        this.clearStallWatchdog();
        this.clearTurnWatchdog();
        this.stallRetries = 0;
        this.turnForces = 0;
        this.callbacks.onResponseStart();
        break;
      // GA WebRTC playback boundaries: the server tracks the audio it has
      // streamed onto the RTP track. These are EXACT — unlike response.done,
      // which fires while several seconds of audio are still buffered/playing.
      case 'output_audio_buffer.started':
        this.playbackEventsSeen = true;
        this.currentResponseHasAudio = true;
        this.callbacks.onSpeakingStart();
        break;
      case 'output_audio_buffer.stopped':
        this.playbackEventsSeen = true;
        this.callbacks.onSpeakingStop();
        break;
      case 'output_audio_buffer.cleared':
        // Server dropped the remaining audio (barge-in / response.cancel).
        this.playbackEventsSeen = true;
        this.callbacks.onSpeakingStop();
        this.callbacks.onBargeIn?.();
        break;
      case 'response.audio.delta':
      case 'response.output_audio.delta': // GA rename
        // Fires for WebSocket transport; for WebRTC the audio rides the RTP
        // track, not the data channel — see audio_transcript.delta below.
        this.currentResponseHasAudio = true;
        this.callbacks.onSpeakingStart();
        break;
      case 'response.audio.done':
      case 'response.audio_transcript.done':
      case 'response.output_audio.done':            // GA rename
      case 'response.output_audio_transcript.done': // GA rename
        // Both signal "no more data being generated" — but RTP audio is still
        // buffered and playing for several seconds after. Do NOT stop phase
        // here. The page schedules a transcript-length timer in
        // onResponseComplete to flip phase when playback actually finishes.
        break;
      case 'response.done': {
        const hadAudio = this.currentResponseHasAudio;
        this.currentResponseHasAudio = false;
        this.responseActive = false;
        // A tool result arrived while this response was still active — its
        // response.create was deferred to here.
        if (this.pendingResponseCreate) {
          this.pendingResponseCreate = false;
          this.responseActive = true; // optimistic again — watchdog covers it
          this.send({ type: 'response.create' });
          this.armStallWatchdog();
        }
        // Tool-call-only responses produce no audio: clear phase immediately.
        // Audio-bearing responses delegate the stop to the page (it knows the
        // accumulated transcript length and can estimate playback duration),
        // or to output_audio_buffer.stopped when playback events are available.
        if (!hadAudio) {
          this.callbacks.onSpeakingStop();
        }
        this.callbacks.onResponseComplete(hadAudio);
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const text = (evt.transcript as string) || '';
        if (text) this.callbacks.onUserTranscript(text, true);
        break;
      }
      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta': { // GA rename
        const delta = (evt.delta as string) || '';
        if (delta) {
          // Over WebRTC this is the reliable "model is now producing speech"
          // signal — audio bytes never come over the data channel. Mark the
          // response as audio-bearing AND drive the speaking phase from here.
          this.currentResponseHasAudio = true;
          this.callbacks.onSpeakingStart();
          this.callbacks.onAssistantTranscript(delta);
        }
        break;
      }
      case 'response.function_call_arguments.done':
        this.handleToolCall(evt).catch((e) => {
          this.callbacks.onError(`tool error: ${e instanceof Error ? e.message : 'unknown'}`);
        });
        break;
      case 'error': {
        const err = evt.error as { message?: string; code?: string } | undefined;
        const msg = err?.message || 'realtime error';
        // "conversation already has an active response" means our create was
        // rejected because a real response is in flight. That one is benign and
        // self-resolving: let response.done flush the deferred create. Anything
        // else may have killed the turn, so reset and let the watchdog retry
        // rather than leaving the patient in silence.
        if (/active response/i.test(msg)) {
          this.responseActive = true;
          this.pendingResponseCreate = true;
          this.armStallWatchdog();
          break; // benign — don't surface it as an error to the patient
        }
        this.responseActive = false;
        this.pendingResponseCreate = false;
        this.callbacks.onError(msg);
        break;
      }
      default:
        // ignore other events
        break;
    }
  }

  private async handleToolCall(evt: Record<string, unknown>): Promise<void> {
    const name = evt.name as keyof ToolDispatcher;
    const callId = evt.call_id as string;
    const argsRaw = (evt.arguments as string) || '{}';
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsRaw);
    } catch {
      args = {};
    }

    let result: unknown;
    try {
      const fn = this.tools[name] as (a: unknown) => Promise<unknown>;
      if (typeof fn !== 'function') throw new Error(`unknown tool ${name}`);
      result = await fn(args);
    } catch (e) {
      result = { error: e instanceof Error ? e.message : 'tool failed' };
    }

    // Send tool result back to model
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result ?? {}),
      },
    });
    // Ask the model to continue speaking (or queue it if a response is still
    // active, e.g. parallel tool calls in one response).
    this.requestResponse();
  }

  /** Ask the model to speak, or queue that request if a response is active. */
  private requestResponse(): void {
    if (this.responseActive) {
      this.pendingResponseCreate = true;
    } else {
      this.responseActive = true; // optimistic — see the watchdog
      this.pendingResponseCreate = false;
      this.send({ type: 'response.create' });
    }
    this.armStallWatchdog();
  }

  /** Recover if the model never starts speaking after we asked it to.
   *
   *  Fires only when something has gone wrong server-side; in the normal case
   *  response.created arrives in a few hundred ms and disarms it. */
  private armStallWatchdog(): void {
    this.clearStallWatchdog();
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      if (this.destroyed) return;
      if (this.stallRetries >= MAX_STALL_RETRIES) {
        this.callbacks.onError('the assistant stopped responding');
        return;
      }
      this.stallRetries++;
      // Whatever we believed about the response state was wrong — the model is
      // not speaking and nothing is going to arrive to unblock us. Reset and
      // ask once more.
      this.responseActive = false;
      this.pendingResponseCreate = false;
      this.callbacks.onStall?.(this.stallRetries);
      this.responseActive = true;
      this.send({ type: 'response.create' });
      this.armStallWatchdog();
    }, RESPONSE_STALL_MS);
  }

  private clearStallWatchdog(): void {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  /** Force the patient's turn through if the server never opens a response.
   *
   *  Commits whatever audio is buffered and asks for a response. Handles both
   *  the semantic-VAD hold (utterance judged incomplete) and the phone echo
   *  case (nurse's own voice interrupted her, the "turn" was garbage and never
   *  committed). The prompt tells the model to repeat its last question when a
   *  turn is empty or unintelligible, so the worst outcome is a repeat — never
   *  silence. */
  private armTurnWatchdog(): void {
    this.clearTurnWatchdog();
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      if (this.destroyed) return;
      // A response opened in the meantime (or we are mid-tool-call and will
      // request one ourselves) — nothing to do.
      if (this.responseActive || this.pendingResponseCreate) return;
      if (this.turnForces >= MAX_TURN_FORCES) {
        this.callbacks.onError('the assistant did not respond');
        return;
      }
      this.turnForces++;
      this.callbacks.onTurnForced?.(this.turnForces);
      this.send({ type: 'input_audio_buffer.commit' });
      this.requestResponse(); // arms the stall watchdog for the create itself
      // If even the forced create produces nothing, try once more.
      this.armTurnWatchdog();
    }, TURN_FORCE_MS);
  }

  private clearTurnWatchdog(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  /** Ask the model to say its last question again — for a patient who did not
   *  hear it, without making them speak. Safe while a response is active: the
   *  request is queued behind it. */
  repeatLastQuestion(): void {
    if (this.destroyed) return;
    if (this.responseActive) {
      this.pendingResponseCreate = true;
      return;
    }
    this.responseActive = true;
    this.send({
      type: 'response.create',
      response: { instructions: 'Briefly repeat your last question to the patient, in your own words.' },
    });
    this.armStallWatchdog();
  }

  private send(payload: Record<string, unknown>): void {
    if (this.dc?.readyState === 'open') {
      this.dc.send(JSON.stringify(payload));
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.clearStallWatchdog();
    this.clearTurnWatchdog();
    try {
      this.dc?.close();
    } catch { /* ignore */ }
    try {
      this.pc?.close();
    } catch { /* ignore */ }
    try {
      this.localStream?.getTracks().forEach((t) => t.stop());
    } catch { /* ignore */ }
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl = null;
    }
  }
}

