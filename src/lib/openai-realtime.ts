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

import type { ApiResponse } from '@/types/api';

export interface RealtimeSessionMint {
  client_secret: string;
  expires_at: number;
  realtime_session_id: string;
  model: string;
}

export interface RealtimeCallbacks {
  onConnected: () => void;
  onDisconnected: (reason?: string) => void;
  onUserTranscript: (text: string, isFinal: boolean) => void;
  onAssistantTranscript: (text: string) => void;
  onResponseStart: () => void;
  onSpeakingStart: () => void;
  onSpeakingStop: () => void;
  onListeningStart: () => void;
  onError: (msg: string) => void;
  onAudioElement: (el: HTMLAudioElement) => void;
}

export interface ToolDispatcher {
  submit_answer: (args: { step: string; value: string }) => Promise<unknown>;
  trigger_measurement: (args: { device_type: string }) => Promise<unknown>;
  flag_emergency: (args: { reason: string }) => Promise<unknown>;
  complete_triage: (args: Record<string, never>) => Promise<unknown>;
}

const REALTIME_URL = 'https://api.openai.com/v1/realtime';

export class RealtimeClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private destroyed = false;

  constructor(
    private mint: RealtimeSessionMint,
    private callbacks: RealtimeCallbacks,
    private tools: ToolDispatcher,
  ) {}

  async connect(): Promise<void> {
    if (this.destroyed) throw new Error('client destroyed');

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
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    // Data channel for events
    this.dc = this.pc.createDataChannel('oai-events');
    this.dc.onopen = () => {
      this.callbacks.onConnected();
    };
    this.dc.onmessage = (e) => this.handleServerEvent(e.data);
    this.dc.onclose = () => this.callbacks.onDisconnected('data channel closed');

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
        this.callbacks.onDisconnected(this.pc.connectionState);
      }
    };

    // SDP exchange with OpenAI Realtime
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const resp = await fetch(`${REALTIME_URL}?model=${encodeURIComponent(this.mint.model)}`, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${this.mint.client_secret}`,
        'Content-Type': 'application/sdp',
        'OpenAI-Beta': 'realtime=v1',
      },
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Realtime SDP exchange failed: ${resp.status} ${errText.slice(0, 200)}`);
    }
    const answerSdp = await resp.text();
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  }

  /** Tell the model to start the conversation. */
  startConversation(): void {
    this.send({ type: 'response.create' });
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
        this.callbacks.onListeningStart();
        break;
      case 'response.created':
        this.callbacks.onResponseStart();
        break;
      case 'response.audio.delta':
        this.callbacks.onSpeakingStart();
        break;
      case 'response.audio.done':
      case 'response.done':
        this.callbacks.onSpeakingStop();
        break;
      case 'conversation.item.input_audio_transcription.completed': {
        const text = (evt.transcript as string) || '';
        if (text) this.callbacks.onUserTranscript(text, true);
        break;
      }
      case 'response.audio_transcript.delta': {
        const delta = (evt.delta as string) || '';
        if (delta) this.callbacks.onAssistantTranscript(delta);
        break;
      }
      case 'response.function_call_arguments.done':
        this.handleToolCall(evt).catch((e) => {
          this.callbacks.onError(`tool error: ${e instanceof Error ? e.message : 'unknown'}`);
        });
        break;
      case 'error':
        this.callbacks.onError((evt.error as { message?: string })?.message || 'realtime error');
        break;
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
    // Ask model to continue speaking
    this.send({ type: 'response.create' });
  }

  private send(payload: Record<string, unknown>): void {
    if (this.dc?.readyState === 'open') {
      this.dc.send(JSON.stringify(payload));
    }
  }

  destroy(): void {
    this.destroyed = true;
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

export async function mintRealtimeSession(
  apiBaseUrl: string,
  sessionId: string,
): Promise<RealtimeSessionMint> {
  const resp = await fetch(`${apiBaseUrl}/triage/realtime/session/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!resp.ok) {
    throw new Error(`mint failed: ${resp.status}`);
  }
  const body = (await resp.json()) as ApiResponse<RealtimeSessionMint>;
  return body.data;
}
