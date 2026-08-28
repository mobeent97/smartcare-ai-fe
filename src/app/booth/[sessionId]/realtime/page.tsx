'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import {
  RealtimeClient,
  MicPermissionError,
  detectDeviceProfile,
  type RealtimeCallbacks,
  type ToolDispatcher,
} from '@/lib/openai-realtime';
import { streamLog } from '@/lib/stream-log';
import { LatencyTracker } from '@/lib/turn-latency';
import { takePrefetchedMint, takePrefetchedClient } from '@/lib/realtime-prewarm';

type Phase = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

interface DebugEvent {
  ts: number;
  label: string;
  detail?: string;
}

const FLOW_STEPS: { id: string; label: string }[] = [
  { id: 'first_look', label: 'Initial check' },
  { id: 'complaint', label: 'Main concern' },
  { id: 'demographics', label: 'About you' },
  { id: 'symptom_detail', label: 'Pain & timing' },
  { id: 'associated_symptoms', label: 'Other symptoms' },
  { id: 'medical_history', label: 'Medical history' },
  { id: 'vitals', label: 'Vital signs' },
];

interface TurnTiming {
  speakStartAt: number | null;
}

export default function RealtimeBoothPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sessionId } = useParams<{ sessionId: string }>();
  const debugEnabled = searchParams.get('debug') === '1';

  // The booth is voice-only: the Realtime model's own audio plays straight out
  // of the audio element, with a phase-driven orb + captions on screen. There
  // is no avatar vendor in the path, so there is no second TTS clock to keep in
  // sync and nothing to wait on before the first word.

  const [phase, setPhase] = useState<Phase>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantSubtitle, setAssistantSubtitle] = useState('');
  const [assistantTurnId, setAssistantTurnId] = useState(0);
  const [emergencyTriggered, setEmergencyTriggered] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [assistantInterrupted, setAssistantInterrupted] = useState(false);
  const [helpSent, setHelpSent] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [triageDone, setTriageDone] = useState(false);

  // Debug / telemetry
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [turnLatencies, setTurnLatencies] = useState<number[]>([]);
  const turnTimingRef = useRef<TurnTiming>({ speakStartAt: null });
  const latencyRef = useRef<LatencyTracker | null>(null);
  const toolCallCountRef = useRef<Record<string, number>>({});

  const clientRef = useRef<RealtimeClient | null>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const assistantBufRef = useRef('');

  const speakStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioStartedAtRef = useRef<number>(0);
  // After complete_triage we must wait for the avatar to FINISH the closing
  // wait-time line before navigating to results — a blind timer cut it off
  // mid-speech. Set pending=true; each finished speech (re)arms a short
  // debounce, so the last spoken line wins. Hard fallback guards a stuck stream.
  const redirectPendingRef = useRef(false);
  const triageDoneRef = useRef(false); // read by the disconnect stream log
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushDebug = (label: string, detail?: string) => {
    if (!debugEnabled) return;
    setDebugEvents((prev) => [...prev.slice(-19), { ts: Date.now(), label, detail }]);
  };

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const trackToolCall = (name: string) => {
      toolCallCountRef.current[name] = (toolCallCountRef.current[name] ?? 0) + 1;
      pushDebug(`tool:${name}`, `count=${toolCallCountRef.current[name]}`);
    };

    // Retry budget: caps repeated tool calls so a confused model can't loop
    // forever. Each tool key has its own counter; once exceeded, returns a
    // permanent failure message that tells the model to give up + advance.
    const PER_TOOL_LIMIT: Record<string, number> = {
      submit_answer: 3,        // per step
      trigger_measurement: 3,  // per device
      flag_emergency: 1,       // never retry an escalation
      complete_triage: 2,
    };
    const TOTAL_TOOL_LIMIT = 80;

    const overBudget = (key: string, perToolLimit: number): string | null => {
      const total = Object.values(toolCallCountRef.current).reduce((a, b) => a + b, 0);
      if (total >= TOTAL_TOOL_LIMIT) {
        return `tool quota exhausted (${TOTAL_TOOL_LIMIT}). Stop calling tools.`;
      }
      const count = toolCallCountRef.current[key] ?? 0;
      if (count >= perToolLimit) {
        return `${key} retry budget exhausted (${perToolLimit}). Treat as recorded and advance to the next step. Do NOT call this tool again.`;
      }
      return null;
    };

    // Navigate to results once the avatar has finished its closing line.
    // Debounced: every time a post-completion speech ends we (re)arm this, so
    // the LAST spoken line wins instead of a fixed timer cutting speech off.
    const armRedirect = (delayMs: number) => {
      if (!redirectPendingRef.current) return;
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = setTimeout(() => {
        redirectTimerRef.current = null;
        if (!cancelled) router.push(`/booth/${sessionId}/results`);
      }, delayMs);
    };

    const tools: ToolDispatcher = {
      submit_answer: async ({ step, value, ...extras }) => {
        const key = `submit_answer:${step}`;
        const block = overBudget(key, PER_TOOL_LIMIT.submit_answer);
        if (block) return { ok: false, error: block, guidance: block };
        trackToolCall(key);
        try {
          // `extras` carries whatever the model already extracted (symptoms,
          // demographics). Passing it through means the server never has to run
          // an LLM parse while the model sits blocked on this response.
          const res = await api.submitAnswer(sessionId, step, value, 'realtime', extras);
          const d = res.data;
          setCompletedSteps((prev) => {
            if (prev.has(step)) return prev;
            const next = new Set(prev);
            next.add(step);
            return next;
          });
          // NOTE: in realtime, vitals are taken AFTER the last question, so the
          // session stays IN_PROGRESS until complete_triage. Do NOT mark triage
          // done here — that happens in complete_triage.
          return {
            ok: true,
            next_step: d.next_step,
            next_question: d.next_question,
            ctas_level: d.ctas_level,
            guidance: d.next_question
              ? `Acknowledge briefly, then ask: "${d.next_question}"`
              : d.next_step === 'end' || d.next_step === 'results'
                ? 'All questions answered. Now take the three vital signs in order (blood pressure, temperature, oxygen) via trigger_measurement if not already done, then call complete_triage.'
                : 'Continue the conversation naturally.',
          };
        } catch (e) {
          return toolError(e, 'Apologize briefly and try a different question.');
        }
      },
      update_answer: async ({ step, value, ...extras }) => {
        const key = `update_answer:${step}`;
        const block = overBudget(key, PER_TOOL_LIMIT.submit_answer);
        if (block) return { ok: false, error: block, guidance: block };
        trackToolCall(key);
        try {
          const res = await api.updateAnswer(sessionId, step, value, 'realtime', extras);
          return res.data; // { ok, step, guidance }
        } catch (e) {
          return toolError(e, 'Briefly acknowledge and continue.');
        }
      },
      trigger_measurement: async ({ device_type }) => {
        const key = `trigger_measurement:${device_type}`;
        const block = overBudget(key, PER_TOOL_LIMIT.trigger_measurement);
        if (block) return { ok: false, error: block, guidance: block };
        trackToolCall(key);
        setCompletedSteps((prev) => {
          if (prev.has('vitals')) return prev;
          const next = new Set(prev);
          next.add('vitals');
          return next;
        });
        try {
        const res = await api.triggerMeasurement(
          sessionId,
          device_type as 'BLOOD_PRESSURE' | 'TEMPERATURE' | 'OXIMETER',
        );
        const r = res.data as unknown as Record<string, number | string | undefined>;
        let readingText = '';
        if (device_type === 'BLOOD_PRESSURE') {
          readingText = `Blood pressure ${r.systolic} over ${r.diastolic} mmHg, heart rate ${r.heart_rate}. Classification: ${r.classification ?? 'Normal'}.`;
        } else if (device_type === 'TEMPERATURE') {
          const t = r.temperature ?? r.value;
          readingText = `Temperature ${t} °C. Classification: ${r.classification ?? 'Normal'}.`;
        } else if (device_type === 'OXIMETER') {
          readingText = `Oxygen saturation ${r.spo2}%, heart rate ${r.heart_rate}. Classification: ${r.classification ?? 'Normal'}.`;
        }
        return {
          ok: true,
          reading: r,
          reading_text: readingText,
          guidance: 'Briefly verbalize this reading to the patient and continue to the next step.',
        };
        } catch (e) {
          return toolError(e, 'Apologize, skip this reading, and continue.');
        }
      },
      flag_emergency: async ({ reason }) => {
        const block = overBudget('flag_emergency', PER_TOOL_LIMIT.flag_emergency);
        if (block) return { ok: false, error: block, guidance: block };
        trackToolCall('flag_emergency');
        try {
          await api.submitAnswer(sessionId, 'first_look', 'yes', 'realtime');
          setEmergencyTriggered(true);
          return {
            ok: true,
            escalated: true,
            reason,
            guidance: 'Emergency alert sent to staff. Tell the patient calmly that help is coming and to stay still. Do NOT call any further tools.',
          };
        } catch (e) {
          return toolError(e, 'Tell the patient calmly that help is coming. Do not retry.');
        }
      },
      complete_triage: async () => {
        const block = overBudget('complete_triage', PER_TOOL_LIMIT.complete_triage);
        if (block) return { ok: false, error: block, guidance: block };
        trackToolCall('complete_triage');
        try {
          // Only mark triage done once the server has actually scored it — it
          // can refuse (missing required steps), and a premature flag would
          // leave the booth showing a completed triage that never happened.
          const res = await api.completeTriage(sessionId);
          setTriageDone(true);
          triageDoneRef.current = true;
          const ctas = res.data.ctas_level;
          const specialty = res.data.routing_specialty;
          const ctasMessage: Record<number, string> = {
            1: 'You will be seen IMMEDIATELY. A nurse is coming to you now.',
            2: 'You will be seen within 15 minutes. Please remain seated and alert staff if symptoms worsen.',
            3: 'You will be seen within 30 minutes. Remain in the waiting area.',
            4: 'You will be seen within 60 minutes. Stay comfortable and let reception know if you feel worse.',
            5: 'You will be seen within 2 hours. Reception will call your name.',
          };
          // Defer navigation until the avatar finishes the closing line below
          // (onResponseComplete re-arms armRedirect when speech ends). Hard
          // fallback at 18s so a stuck/silent stream still moves on.
          redirectPendingRef.current = true;
          armRedirect(18000);
          return {
            ok: true,
            ctas_level: ctas,
            routing_specialty: specialty,
            message_for_patient: ctas ? ctasMessage[ctas] : 'A clinician will see you soon.',
            guidance: 'Briefly tell the patient their wait time and where they will be seen. Then thank them and stop calling tools.',
          };
        } catch (e) {
          return toolError(e, 'Apologize and tell the patient a clinician will be with them soon.');
        }
      },
    };

    let reconnectAttempts = 0;
    let mintInFlight = false;
    // Hospital Wi-Fi drops. Three tries with backoff (1s, 2s, 4s); the backend
    // rebuilds a RESUME block on every fresh mint so the patient never repeats
    // themselves.
    const MAX_RECONNECTS = 3;
    const backoffMs = (attempt: number) => 1000 * 2 ** (attempt - 1);

    const connectClient = async () => {
      // Guard against React StrictMode double-mount + Fast Refresh causing
      // two simultaneous mints — each one burns an OpenAI Realtime session
      // and trips the per-IP throttle.
      if (mintInFlight) return;
      mintInFlight = true;
      const latency = (latencyRef.current ??= new LatencyTracker(sessionId));
      try {
        // Prefer a connection the consent page already opened. Its relays
        // buffered every event (incl. onConnected) until we attach here, which
        // is what triggers the greeting — so the nurse speaks the moment the
        // page is on screen, not 2–3s later.
        const pre = takePrefetchedClient(sessionId);
        let client: RealtimeClient;

        const callbacks: RealtimeCallbacks = {
            onConnected: () => {
              if (cancelled) return;
              reconnectAttempts = 0;            // healthy connection resets budget
              setReconnecting(false);
              pushDebug('connected');
              setPhase('listening');
              client.startConversation();
            },
            onDisconnected: (reason) => {
              if (cancelled) return;
              pushDebug('disconnected', reason);
              streamLog(sessionId, 'RT_DISCONNECTED', { reason, attempts: reconnectAttempts, triageDone: triageDoneRef.current });
              // One automatic reconnect on transient WebRTC failure. Mints fresh
              // ephemeral key (the old one is single-use). Skip on user-triggered
              // disconnects (destroyed) and after the budget is spent.
              if (reconnectAttempts < MAX_RECONNECTS) {
                reconnectAttempts++;
                pushDebug('reconnect_attempt', String(reconnectAttempts));
                streamLog(sessionId, 'RT_RECONNECT_ATTEMPT', { attempt: reconnectAttempts });
                setReconnecting(true);
                setPhase('connecting');
                clientRef.current?.destroy();
                clientRef.current = null;
                setTimeout(() => { if (!cancelled) connectClient(); }, backoffMs(reconnectAttempts));
                return;
              }
              setReconnecting(false);
              setPhase('error');
              setErrorMsg(reason ?? 'Connection lost');
            },
            onUserTranscript: (text, isFinal) => {
              if (cancelled || !isFinal) return;
              setUserTranscript(text);
              pushDebug('user_transcript', text.slice(0, 80));
            },
            onAssistantTranscript: (delta) => {
              if (cancelled) return;
              assistantBufRef.current += delta;
              // The model's own audio is what the patient hears, so the subtitle
              // can track its text directly.
              setAssistantSubtitle(assistantBufRef.current);
            },
            onResponseStart: () => {
              if (cancelled) return;
              // New model response begins — reset the text buffer for this turn.
              assistantBufRef.current = '';
              setAssistantSubtitle('');
              setAssistantInterrupted(false);
              setAssistantTurnId((n) => n + 1);
              audioStartedAtRef.current = 0;
              if (speakStopTimerRef.current) {
                clearTimeout(speakStopTimerRef.current);
                speakStopTimerRef.current = null;
              }
              latency.responseStart();
              pushDebug('response_start');
            },
            onSpeakingStart: () => {
              if (cancelled) return;
              latency.firstAudio();
              // Fires per transcript delta — record true audio start once per turn.
              const t = turnTimingRef.current;
              if (t.speakStartAt) {
                setPhase('speaking');
                return;
              }
              const now = Date.now();
              t.speakStartAt = now;
              audioStartedAtRef.current = now;
              setPhase('speaking');
              pushDebug('speaking_start');
            },
            onSpeakingStop: () => {
              if (cancelled) return;
              // Reset turn-start guard so next response measures latency fresh.
              turnTimingRef.current.speakStartAt = null;
              if (speakStopTimerRef.current) {
                clearTimeout(speakStopTimerRef.current);
                speakStopTimerRef.current = null;
              }
              setPhase('listening');
              pushDebug('speaking_stop');
            },
            onResponseComplete: (hadAudio: boolean) => {
              if (cancelled) return;
              const turn = latency.flushTurn();
              if (turn?.totalMs != null) {
                setTurnLatencies((prev) => [...prev.slice(-9), turn.totalMs as number]);
                pushDebug(
                  'turn_latency_ms',
                  `total=${turn.totalMs} think=${turn.thinkMs ?? '-'} tools=${turn.toolMs}`,
                );
              }
              if (!hadAudio || !audioStartedAtRef.current) return;
              // GA WebRTC emits output_audio_buffer.stopped at the EXACT end of
              // playback — onSpeakingStop flips the phase then. No estimator
              // needed; scheduling one anyway would cut speech off early.
              if (client.hasPlaybackEvents) {
                pushDebug('response_complete', 'exact playback events');
                return;
              }
              // Fallback (no playback events): RTP audio plays in real time and
              // keeps going for seconds after response.done fires. Estimate
              // total spoken duration from the accumulated transcript:
              // ~150 wpm ≈ 400 ms/word, plus a 1.2 s tail to cover the model's
              // natural ending pauses + jitter buffer. Subtract however much
              // has already played (now - audioStarted).
              const text = assistantBufRef.current.trim();
              const wordCount = text ? text.split(/\s+/).length : 0;
              const totalAudioMs = wordCount * 400 + 1200;
              const playedMs = Date.now() - audioStartedAtRef.current;
              const remaining = Math.max(1200, totalAudioMs - playedMs);
              if (speakStopTimerRef.current) clearTimeout(speakStopTimerRef.current);
              speakStopTimerRef.current = setTimeout(() => {
                speakStopTimerRef.current = null;
                turnTimingRef.current.speakStartAt = null;
                audioStartedAtRef.current = 0;
                setPhase((p) => (p === 'speaking' ? 'listening' : p));
                pushDebug('speaking_stop_timer');
              }, remaining);
              pushDebug('response_complete', `words=${wordCount} hold=${remaining}ms`);
            },
            onBargeIn: () => {
              if (cancelled) return;
              // Server cleared the output buffer — the patient interrupted.
              // Drop straight to listening; cancel any pending estimator stop.
              if (speakStopTimerRef.current) {
                clearTimeout(speakStopTimerRef.current);
                speakStopTimerRef.current = null;
              }
              turnTimingRef.current.speakStartAt = null;
              audioStartedAtRef.current = 0;
              setPhase((p) => (p === 'speaking' ? 'listening' : p));
              pushDebug('barge_in');
              streamLog(sessionId, 'BARGE_IN');
              // The caption streams ahead of the audio, so it shows words the
              // nurse never got to say. Flag it rather than pretend.
              setAssistantInterrupted(true);
            },
            onUserSpeechStart: () => {
              if (cancelled) return;
              // Mic frequently picks up the kiosk speaker's playback as "user
              // speech" (echo bleed). Ignore VAD while the model is speaking —
              // the audio activity detector below owns the speaking→listening
              // transition. Real barge-in still works server-side.
              setPhase((p) => (p === 'speaking' ? p : 'listening'));
              pushDebug('user_speech_started');
            },
            onUserSpeechStop: () => {
              if (cancelled) return;
              latency.speechStop();
              setPhase((p) => (p === 'speaking' ? p : 'thinking'));
              pushDebug('user_speech_stopped');
            },
            onConnectionStateChange: (state) => {
              if (cancelled) return;
              pushDebug('pc_state', state);
              // 'disconnected' is transient ICE probing — say so, do not tear
              // down. 'failed'/'closed' arrive via onDisconnected.
              if (state === 'disconnected') {
                setReconnecting(true);
                setPhase((p) => (p === 'error' ? p : 'connecting'));
              } else if (state === 'connected') {
                setReconnecting(false);
                setPhase((p) => (p === 'connecting' ? 'listening' : p));
              }
            },
            onTurnForced: (attempt) => {
              if (cancelled) return;
              // Server never opened a response after the patient's turn; the
              // client committed the audio and asked for one. Invisible to the
              // patient — recorded so latency_report can show how often
              // semantic VAD holds a turn open.
              pushDebug('turn_forced', `attempt=${attempt}`);
              streamLog(sessionId, 'TURN_FORCED', { attempt });
            },
            onStall: (attempt) => {
              if (cancelled) return;
              // The model went quiet when it owed us a reply and the client is
              // re-prompting it. Logged rather than shown — the patient should
              // just hear the nurse resume.
              pushDebug('stall_recovery', `attempt=${attempt}`);
              streamLog(sessionId, 'STALL_RECOVERY', { attempt });
            },
            onError: (msg) => {
              if (cancelled) return;
              setErrorMsg(msg);
              pushDebug('error', msg);
            },
            onPhaseMark: (mark) => latency.coldMark(mark as Parameters<LatencyTracker['coldMark']>[0]),
            onAudioElement: (el) => {
              if (audioContainerRef.current) {
                audioContainerRef.current.innerHTML = '';
                audioContainerRef.current.appendChild(el);
              }
              setAudioEl(el);
              // iOS will not autoplay remote audio without a user gesture in
              // some configurations. If playback is refused, ask for one tap
              // rather than letting the nurse talk silently.
              el.play().catch((err: unknown) => {
                if (cancelled) return;
                const name = (err as { name?: string })?.name;
                if (name === 'NotAllowedError') {
                  setNeedsAudioUnlock(true);
                  pushDebug('audio_autoplay_blocked');
                }
              });
            },
        };

        if (pre) {
          client = pre.client;
          clientRef.current = client;
          latency.coldMark('mint_start');
          latency.coldMark('mint_done');
          pushDebug('prewarmed_connection', pre.client.isConnected ? 'already open' : 'still connecting');
          streamLog(sessionId, 'PREWARMED_CONNECTION', { open: pre.client.isConnected });
          if (cancelled) { client.destroy(); return; }
          client.attach(callbacks, instrumentTools(tools, latency));
        } else {
          latency.coldMark('mint_start');
          // The consent page starts this round trip on "I agree", so by the time
          // we get here it is usually already done. Falls back to minting inline
          // whenever the prefetch is missing, stale, or failed.
          const prefetched = await takePrefetchedMint(sessionId);
          if (prefetched) pushDebug('mint_prefetched');
          const mint = prefetched ?? (await api.createRealtimeSession(sessionId, detectDeviceProfile()));
          latency.coldMark('mint_done');
          if (cancelled) return;
          client = new RealtimeClient(mint, callbacks, instrumentTools(tools, latency));
          clientRef.current = client;
          await client.connect();
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Failed to start session';
        // No microphone = no voice booth. Retrying will not change that;
        // show the specific fix instead of burning reconnect attempts.
        if (e instanceof MicPermissionError) {
          setMicDenied(true);
          setPhase('error');
          setErrorMsg(msg);
          streamLog(sessionId, 'MIC_DENIED', { cause: e.cause_name });
          return;
        }
        // A failed initial connect also burns a reconnect slot before giving up.
        if (reconnectAttempts < MAX_RECONNECTS) {
          reconnectAttempts++;
          pushDebug('reconnect_attempt', String(reconnectAttempts));
          setReconnecting(true);
          setTimeout(() => { if (!cancelled) connectClient(); }, backoffMs(reconnectAttempts));
          return;
        }
        setReconnecting(false);
        setPhase('error');
        setErrorMsg(msg);
      } finally {
        // Clear flag so a genuine disconnect → reconnect path can mint again.
        // The cancelled check above prevents the second StrictMode invocation
        // from doing anything useful, but the flag must reset for real
        // post-connect reconnect attempts.
        mintInFlight = false;
      }
    };

    connectClient();

    return () => {
      cancelled = true;
      if (speakStopTimerRef.current) {
        clearTimeout(speakStopTimerRef.current);
        speakStopTimerRef.current = null;
      }
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, [sessionId, router]);

  const isSpeaking = phase === 'speaking';
  // Plain language, present tense, no jargon. "One moment" rather than
  // "Thinking" because the patient does not need to know a model exists.
  const phaseLabel = phase === 'speaking'
    ? 'Nurse is speaking'
    : phase === 'listening'
      ? micMuted ? 'Microphone off' : 'Listening'
      : phase === 'thinking'
        ? 'One moment…'
        : phase === 'connecting'
          ? reconnecting ? 'Reconnecting…' : 'Connecting…'
          : 'Connection lost';

  return (
    <>
      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes status-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.5; }
        }
        @keyframes speak-ring {
          0%   { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes speak-ring2 {
          0%   { transform: scale(1); opacity: 0.3; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes orb-glow {
          0%, 100% { box-shadow: 0 0 60px rgba(9,246,238,0.25), inset 0 0 40px rgba(9,246,238,0.12); }
          50%      { box-shadow: 0 0 80px rgba(9,246,238,0.4),  inset 0 0 50px rgba(9,246,238,0.18); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fade-up { animation: fade-up 0.4s ease both; }
      `}</style>

      <div className="booth-kiosk min-h-screen flex flex-col" style={{ background: 'var(--color-dash-bg)' }}>

        {/* ── Header ── */}
        <header style={{
          minHeight: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          // Standalone iOS draws the status bar / Dynamic Island OVER the page.
          // Without this the logo sits underneath it.
          paddingTop: 'var(--safe-top)',
          paddingLeft: 'max(24px, var(--safe-left))',
          paddingRight: 'max(24px, var(--safe-right))',
          borderBottom: '1px solid rgba(9,246,238,0.08)',
          background: 'rgba(7,28,28,0.9)',
          backdropFilter: 'blur(12px)',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(9,246,238,0.15), rgba(54,201,197,0.08))',
              border: '1px solid rgba(9,246,238,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#09f6ee" strokeWidth="2" strokeLinecap="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <span style={{ color: '#09f6ee', fontWeight: 900, fontFamily: 'monospace', fontSize: 15, letterSpacing: '-0.03em' }}>
              SmartCare<span style={{ color: '#f0fffe' }}>AI</span>
            </span>
            {(process.env.NODE_ENV !== 'production' || debugEnabled) && (
              <span style={{
                marginLeft: 10,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.1em',
                padding: '3px 8px',
                borderRadius: 4,
                background: 'rgba(168,85,247,0.12)',
                border: '1px solid rgba(168,85,247,0.4)',
                color: '#c4b5fd',
                textTransform: 'uppercase',
              }}>
                Realtime
              </span>
            )}
          </div>

          <button
            onClick={async () => {
              // Persist the escalation server-side via the same path the model uses,
              // then tear down the WebRTC connection so the mic stops before nav.
              try {
                await api.submitAnswer(sessionId, 'first_look', 'yes', 'realtime');
              } catch { /* navigate even if server escalate fails */ }
              clientRef.current?.destroy();
              clientRef.current = null;
              router.push(`/booth/${sessionId}/emergency`);
            }}
            aria-label="Emergency — get help now"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(220,38,38,0.1)',
              border: '1px solid rgba(220,38,38,0.4)',
              borderRadius: 10,
              padding: '6px 14px',
              minHeight: 44, minWidth: 44,
              color: '#fca5a5',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="hidden md:inline">Emergency</span>
          </button>
        </header>

        {/* ── Progress strip ── */}
        <ProgressStrip completed={completedSteps} done={triageDone} />

        {/* ── Audio unlock (iOS refused autoplay) ── */}
        {needsAudioUnlock && (
          <button
            onClick={() => {
              audioEl?.play()
                .then(() => setNeedsAudioUnlock(false))
                .catch(() => { /* keep the gate up; they can tap again */ });
            }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4"
            style={{ background: 'rgba(5,20,20,0.96)', border: 'none', color: '#e0fffe' }}
          >
            <span style={{
              width: 88, height: 88, borderRadius: '50%',
              background: 'rgba(9,246,238,0.12)', border: '2px solid rgba(9,246,238,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'orb-glow 2s ease-in-out infinite',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#09f6ee" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a9 9 0 0 1 0 14" />
              </svg>
            </span>
            <span style={{ fontSize: 20, fontWeight: 700 }}>Tap to hear the nurse</span>
            <span style={{ fontSize: 14, color: 'rgba(224,255,254,0.65)' }}>Your phone needs one tap to play sound</span>
          </button>
        )}

        {/* ── Controls: thumb zone, always reachable ── */}
        <nav
          aria-label="Call controls"
          className="fixed inset-x-0 bottom-0 z-30 flex justify-center"
          style={{
            background: 'rgba(5,20,20,0.85)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderTop: '1px solid rgba(9,246,238,0.1)',
            paddingTop: 10,
            paddingBottom: 'max(10px, var(--safe-bottom))',
            paddingLeft: 'max(16px, var(--safe-left))',
            paddingRight: 'max(16px, var(--safe-right))',
          }}
        >
          <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 560 }}>
            <ControlButton
              label="Repeat"
              hint="Say the question again"
              disabled={phase === 'connecting' || phase === 'error' || triageDone}
              onClick={() => { clientRef.current?.repeatLastQuestion(); pushDebug('repeat_requested'); }}
              icon={<path d="M1 4v6h6" />}
              icon2={<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />}
            />
            <ControlButton
              label={micMuted ? 'Unmute' : 'Mute'}
              hint={micMuted ? 'The nurse cannot hear you' : 'Turn your microphone off'}
              active={micMuted}
              disabled={phase === 'connecting' || phase === 'error'}
              onClick={() => {
                const next = !micMuted;
                setMicMuted(next);
                clientRef.current?.setMicEnabled(!next);
                pushDebug(next ? 'mic_muted' : 'mic_unmuted');
              }}
              icon={micMuted
                ? <><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /></>
                : <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /></>}
            />
            <ControlButton
              label={helpSent ? 'Staff notified' : 'Call for help'}
              hint="Ask a person to come over"
              tone="amber"
              active={helpSent}
              disabled={helpSent}
              onClick={async () => {
                try {
                  await api.requestHelp(sessionId);
                  setHelpSent(true);
                  streamLog(sessionId, 'HELP_REQUESTED');
                  setTimeout(() => setHelpSent(false), 20000);
                } catch { pushDebug('help_request_failed'); }
              }}
              icon={<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>}
            />
          </div>
        </nav>

        {/* ── Main ── */}
        <div
          className="booth-stage flex-1 flex flex-col items-center"
          style={{
            // Leave room for the fixed control bar + home indicator.
            padding: '24px 20px calc(var(--booth-controls-h) + var(--safe-bottom) + 24px)',
            paddingLeft: 'max(20px, var(--safe-left))',
            paddingRight: 'max(20px, var(--safe-right))',
            gap: 28,
          }}
        >

          {/* Video avatar stage */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Outer rings — only visible while model is speaking */}
            <div style={{
              position: 'absolute', inset: -16, borderRadius: 32,
              border: `1.5px solid rgba(9,246,238,${isSpeaking ? '0.4' : '0.08'})`,
              animation: isSpeaking ? 'speak-ring 1.6s ease-in-out infinite' : 'none',
              transition: 'border-color 0.4s',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', inset: -34, borderRadius: 36,
              border: `1px solid rgba(9,246,238,${isSpeaking ? '0.2' : '0.04'})`,
              animation: isSpeaking ? 'speak-ring2 1.6s ease-in-out infinite 0.4s' : 'none',
              transition: 'border-color 0.4s',
              pointerEvents: 'none',
            }} />

            {/* Video card with crossfaded loops */}
            <div className="booth-orb" style={{
              // Fluid, but never larger than the original kiosk size. 62vw
              // leaves room for the -34px decorative rings AND the captions on
              // an iPhone X-height screen.
              width: 'min(320px, 62vw)',
              height: 'min(320px, 62vw)',
              borderRadius: 24,
              overflow: 'hidden',
              border: '2px solid rgba(9,246,238,0.35)',
              background: 'var(--color-dash-card)',
              position: 'relative',
              animation: 'orb-glow 3s ease-in-out infinite',
            }}>
              <VoiceOrb phase={phase} />

              {/* Live badge */}
              <div style={{
                position: 'absolute', top: 14, right: 14,
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(5,20,20,0.75)',
                border: '1px solid rgba(9,246,238,0.3)',
                borderRadius: 20,
                padding: '4px 10px',
                backdropFilter: 'blur(8px)',
                zIndex: 2,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: phase === 'connecting' ? '#64748b' : '#09f6ee',
                  animation: phase === 'connecting' ? 'none' : 'status-dot 1.5s ease-in-out infinite',
                  display: 'block',
                }} />
                <span style={{ color: '#09f6ee', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {phase === 'connecting' ? 'Connecting' : 'Live'}
                </span>
              </div>

              {/* Audio-driven waveform overlay (bottom strip) */}
              <Waveform audioEl={audioEl} active={isSpeaking} />
            </div>

            {/* Phase pill */}
            <div style={{
              marginTop: 20,
              display: 'flex', alignItems: 'center', gap: 7,
              background: 'var(--color-dash-card)',
              border: `1px solid rgba(9,246,238,${isSpeaking ? '0.4' : '0.15'})`,
              borderRadius: 20,
              padding: '6px 16px',
              transition: 'all 0.3s',
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: phase === 'speaking' ? '#09f6ee' : phase === 'thinking' ? '#a855f7' : phase === 'error' ? '#dc2626' : '#36c9c5',
                animation: (phase === 'speaking' || phase === 'listening') ? 'status-dot 1s ease-in-out infinite' : 'none',
                display: 'block',
                flexShrink: 0,
              }} />
              <span style={{
                color: isSpeaking ? '#09f6ee' : '#5dd5d3',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>
                {phaseLabel}
              </span>
            </div>
          </div>

          {/* Content area */}
          <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Assistant subtitle bubble */}
            {assistantSubtitle && (
              <div
                key={assistantTurnId}
                className="fade-up"
                style={{
                  background: 'var(--color-dash-card)',
                  border: '1px solid rgba(54,201,197,0.2)',
                  borderRadius: 18,
                  padding: '18px 20px',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                  background: 'linear-gradient(to bottom, #09f6ee, #36c9c5)',
                  borderRadius: '18px 0 0 18px',
                }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingLeft: 8 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#09f6ee" strokeWidth="1.9"
                       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
                    <path d="M4.8 3v5.4a4.2 4.2 0 0 0 8.4 0V3" /><circle cx="18.4" cy="13.6" r="2.4" />
                    <path d="M9 12.6v2.2a5.4 5.4 0 0 0 7 5.2" />
                  </svg>
                  <p
                    className="caption-text"
                    aria-live="polite"
                    style={{
                      color: assistantInterrupted ? 'rgba(224,255,254,0.55)' : '#e0fffe',
                      fontSize: 'clamp(16px, 4.4vw, 19px)', lineHeight: 1.55, fontWeight: 500, margin: 0,
                    }}
                  >
                    {assistantSubtitle}
                    {assistantInterrupted && (
                      <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: 'rgba(196,181,253,0.8)', fontWeight: 600 }}>
                        — you interrupted, go ahead
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* User transcript */}
            {userTranscript && (
              <div
                className="fade-up"
                style={{
                  background: 'rgba(11,40,39,0.5)',
                  border: '1px solid rgba(168,85,247,0.2)',
                  borderRadius: 18,
                  padding: '14px 18px',
                  marginLeft: 'auto',
                  maxWidth: '90%',
                }}
              >
                <p style={{ color: 'rgba(196,181,253,0.7)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                  You said
                </p>
                <p style={{ color: '#f0fffe', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
                  {userTranscript}
                </p>
              </div>
            )}

            {emergencyTriggered && (
              <div className="fade-up" style={{
                background: 'rgba(127,29,29,0.4)',
                border: '1px solid rgba(220,38,38,0.5)',
                borderRadius: 12,
                padding: '14px 18px',
              }}>
                <p style={{ color: '#fca5a5', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                  🚨 Emergency flagged
                </p>
                <p style={{ color: '#fecaca', fontSize: 12 }}>
                  Staff have been notified. Please remain still.
                </p>
              </div>
            )}

            {phase === 'error' && (
              <div className="fade-up" style={{
                background: 'var(--color-dash-card)',
                border: '1px solid rgba(220,38,38,0.4)',
                borderRadius: 12,
                padding: '16px 20px',
              }}>
                <p style={{ color: '#fca5a5', fontWeight: 700, marginBottom: 6, fontSize: 14 }}>
                  {micDenied ? 'Microphone access needed' : 'Connection issue'}
                </p>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 12 }}>
                  {micDenied
                    ? 'The nurse cannot hear you without the microphone. Allow microphone access, then tap Try again. On iPhone: Settings → Safari → Microphone → Allow.'
                    : errorMsg}
                </p>
                {micDenied && (
                  <button
                    onClick={() => window.location.reload()}
                    style={{
                      background: '#09f6ee', color: '#0a0f1e', fontWeight: 700,
                      padding: '10px 16px', borderRadius: 10, border: 'none', fontSize: 13,
                      minHeight: 44, marginRight: 10, marginBottom: 8,
                    }}
                  >
                    Try again
                  </button>
                )}
                <button
                  onClick={() => router.push(`/booth/${sessionId}/manual`)}
                  style={{
                    background: '#36c9c5',
                    color: '#0a0f1e',
                    fontWeight: 700,
                    padding: '10px 16px',
                    borderRadius: 10,
                    border: 'none',
                    fontSize: 13,
                  }}
                >
                  Switch to keyboard mode →
                </button>
              </div>
            )}
          </div>

          <div ref={audioContainerRef} style={{ display: 'none' }} />
        </div>

        {debugEnabled && (
          <DebugOverlay
            phase={phase}
            events={debugEvents}
            turnLatencies={turnLatencies}
            toolCallCounts={toolCallCountRef.current}
            errorMsg={errorMsg}
          />
        )}
      </div>
    </>
  );
}

// ─── Debug overlay (?debug=1) ───────────────────────────────────────────────
function DebugOverlay({
  phase, events, turnLatencies, toolCallCounts, errorMsg,
}: {
  phase: Phase;
  events: DebugEvent[];
  turnLatencies: number[];
  toolCallCounts: Record<string, number>;
  errorMsg: string;
}) {
  const avgLatency = turnLatencies.length > 0
    ? Math.round(turnLatencies.reduce((a, b) => a + b, 0) / turnLatencies.length)
    : 0;
  const lastLatency = turnLatencies[turnLatencies.length - 1] ?? 0;

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      width: 340,
      maxHeight: '70vh',
      overflowY: 'auto',
      background: 'rgba(5,20,20,0.92)',
      border: '1px solid rgba(168,85,247,0.4)',
      borderRadius: 12,
      padding: 12,
      fontFamily: 'monospace',
      fontSize: 11,
      color: '#e0fffe',
      backdropFilter: 'blur(12px)',
      zIndex: 1000,
    }}>
      <div style={{ color: '#c4b5fd', fontWeight: 700, marginBottom: 8, letterSpacing: '0.08em', fontSize: 10 }}>
        REALTIME DEBUG · {phase.toUpperCase()}
      </div>
      <Row k="Turn latency last/avg" v={`${lastLatency}ms / ${avgLatency}ms`} />
      <Row k="Turns recorded" v={String(turnLatencies.length)} />
      {errorMsg && <Row k="Error" v={errorMsg} color="#fca5a5" />}
      <div style={{ borderTop: '1px solid rgba(168,85,247,0.2)', margin: '8px 0', paddingTop: 6 }}>
        <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 4 }}>TOOL CALLS</div>
        {Object.entries(toolCallCounts).length === 0 && (
          <div style={{ color: '#6b7280' }}>none yet</div>
        )}
        {Object.entries(toolCallCounts).map(([name, count]) => (
          <Row key={name} k={name} v={String(count)} />
        ))}
      </div>
      <div style={{ borderTop: '1px solid rgba(168,85,247,0.2)', margin: '8px 0', paddingTop: 6 }}>
        <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 4 }}>EVENT LOG</div>
        {events.length === 0 && <div style={{ color: '#6b7280' }}>no events yet</div>}
        {events.slice().reverse().map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
            <span style={{ color: '#64748b', flexShrink: 0 }}>
              {new Date(e.ts).toLocaleTimeString('en-US', { hour12: false }).slice(3)}
            </span>
            <span style={{ color: '#86dfdc' }}>{e.label}</span>
            {e.detail && <span style={{ color: '#a78bfa', opacity: 0.8 }}>{e.detail.slice(0, 40)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
      <span style={{ color: '#86dfdc' }}>{k}</span>
      <span style={{ color: color ?? '#e0fffe' }}>{v}</span>
    </div>
  );
}

// ─── Progress strip ────────────────────────────────────────────────────────
function ProgressStrip({ completed, done }: { completed: Set<string>; done: boolean }) {
  // Current = first step not yet completed (or last if done)
  let currentIdx = FLOW_STEPS.findIndex((s) => !completed.has(s.id));
  if (currentIdx === -1) currentIdx = FLOW_STEPS.length - 1;
  const currentLabel = done ? 'Wrapping up' : FLOW_STEPS[currentIdx].label;
  const completedCount = done
    ? FLOW_STEPS.length
    : Math.min(completed.size, FLOW_STEPS.length);

  return (
    <div style={{
      borderBottom: '1px solid rgba(9,246,238,0.06)',
      background: 'rgba(7,28,28,0.6)',
      padding: '10px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: 'monospace',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: 'rgba(9,246,238,0.55)',
        textTransform: 'uppercase',
        flexShrink: 0,
      }}>
        Step {Math.min(currentIdx + 1, FLOW_STEPS.length)} of {FLOW_STEPS.length}
      </span>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flex: 1,
        maxWidth: 280,
      }}>
        {FLOW_STEPS.map((s, i) => {
          const isDone = completed.has(s.id);
          const isCurrent = i === currentIdx && !done;
          return (
            <div
              key={s.id}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: isDone
                  ? '#36c9c5'
                  : isCurrent
                    ? 'linear-gradient(90deg, #09f6ee 0%, rgba(9,246,238,0.2) 100%)'
                    : 'rgba(9,246,238,0.12)',
                boxShadow: isCurrent ? '0 0 6px rgba(9,246,238,0.6)' : 'none',
                transition: 'background 0.4s, box-shadow 0.4s',
              }}
            />
          );
        })}
      </div>

      <span style={{
        fontSize: 12,
        fontWeight: 600,
        color: '#86dfdc',
        flexShrink: 0,
      }}>
        {currentLabel}
      </span>

      <span style={{
        fontSize: 11,
        color: 'rgba(134,223,220,0.5)',
        marginLeft: 'auto',
        fontFamily: 'monospace',
        flexShrink: 0,
      }}>
        {completedCount}/{FLOW_STEPS.length}
      </span>
    </div>
  );
}

// ─── Server-rejection guidance ─────────────────────────────────────────────
// The backend enforces the rules that must actually hold (step validity, repeat
// caps, scoring preconditions) and returns a `guidance` string the model can act
// on. Without this the model only sees "Request failed with status code 403" and
// retries blindly until it burns its budget.
function toolError(e: unknown, fallback: string): { ok: false; error: string; guidance: string } {
  const resp = (e as { response?: { data?: { data?: Record<string, unknown> } } })?.response;
  const payload = resp?.data?.data;
  const guidance = typeof payload?.guidance === 'string' ? payload.guidance : fallback;
  const error =
    typeof payload?.error === 'string'
      ? payload.error
      : e instanceof Error
        ? e.message
        : 'tool call failed';
  return { ok: false, error, guidance };
}

// ─── Tool-call instrumentation ─────────────────────────────────────────────
// Wraps the dispatcher so every tool round trip is timed without any of the
// handlers having to know about the tracker. The model is blocked on these
// calls, so their duration is dead air the patient hears as silence.
// Every tool call also has a hard deadline. The model is blocked on the
// result; a hung backend must not hang the conversation — and the turn
// watchdog would otherwise fire a response.create with no result, so the
// nurse would talk past a recording that lands late.
const TOOL_TIMEOUT_MS = 8000;

function instrumentTools(tools: ToolDispatcher, latency: LatencyTracker): ToolDispatcher {
  const wrapped = {} as Record<string, (args: never) => Promise<unknown>>;
  for (const [name, fn] of Object.entries(tools)) {
    wrapped[name] = async (args: never) => {
      latency.toolStart(name);
      let timer: ReturnType<typeof setTimeout> | null = null;
      const deadline = new Promise<unknown>((resolve) => {
        timer = setTimeout(() => resolve({
          ok: false,
          error: `${name} timed out`,
          guidance: 'The record did not save in time. Briefly tell the patient you will note it down, and continue to the next question.',
        }), TOOL_TIMEOUT_MS);
      });
      try {
        return await Promise.race([(fn as (a: never) => Promise<unknown>)(args), deadline]);
      } finally {
        if (timer) clearTimeout(timer);
        latency.toolEnd(name);
      }
    };
  }
  return wrapped as unknown as ToolDispatcher;
}

// ─── Call control button ───────────────────────────────────────────────────
// >=56px tall, label always visible (no icon-only controls for patients),
// pressed feedback via colour not transform so the bar never shifts.
function ControlButton({
  label, hint, icon, icon2, onClick, active = false, disabled = false, tone = 'teal',
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  icon2?: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  tone?: 'teal' | 'amber';
}) {
  const accent = tone === 'amber' ? '#f59e0b' : '#09f6ee';
  const accentSoft = tone === 'amber' ? 'rgba(245,158,11,0.16)' : 'rgba(9,246,238,0.14)';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={hint}
      style={{
        flex: 1, minHeight: 56,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
        borderRadius: 14,
        border: `1px solid ${active ? accent : 'rgba(9,246,238,0.18)'}`,
        background: active ? accentSoft : 'rgba(11,40,39,0.6)',
        color: disabled ? 'rgba(93,213,211,0.35)' : active ? accent : '#cffffd',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
        padding: '6px 8px',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icon}{icon2}
      </svg>
      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

// ─── Voice-only orb ────────────────────────────────────────────────────────
// Stands in for the avatar when AVATAR_PROVIDER=none. Purely CSS/phase-driven:
// no video element, no media stream, nothing to load — so it can never be the
// thing that delays or desyncs speech. The Waveform overlay still renders on
// top of it from the Realtime audio element.
function VoiceOrb({ phase }: { phase: Phase }) {
  const speaking = phase === 'speaking';
  const listening = phase === 'listening';
  const thinking = phase === 'thinking';
  const connecting = phase === 'connecting';
  const accent = phase === 'error' ? '#dc2626' : thinking ? '#a855f7' : '#09f6ee';

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 45%, rgba(9,246,238,0.07), var(--color-dash-card))',
    }}>
      {/* Expanding rings while the nurse is talking */}
      {speaking && (
        <>
          <div style={{
            position: 'absolute', width: 150, height: 150, borderRadius: '50%',
            border: `2px solid ${accent}`, animation: 'speak-ring 1.6s ease-out infinite',
          }} />
          <div style={{
            position: 'absolute', width: 150, height: 150, borderRadius: '50%',
            border: `2px solid ${accent}`, animation: 'speak-ring2 1.6s ease-out 0.5s infinite',
          }} />
        </>
      )}

      <div style={{
        width: 150, height: 150, borderRadius: '50%',
        background: `radial-gradient(circle at 50% 40%, ${accent}33, ${accent}0d 60%, transparent 72%)`,
        border: `2px solid ${accent}${listening ? '99' : '4d'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: connecting ? 'spin 1.4s linear infinite' : 'orb-glow 3s ease-in-out infinite',
        transition: 'border-color 0.3s ease',
      }}>
        <div style={{
          width: listening ? 34 : 22, height: listening ? 34 : 22,
          borderRadius: '50%', background: accent,
          opacity: connecting ? 0.35 : 0.85,
          animation: (speaking || listening) ? 'status-dot 1s ease-in-out infinite' : 'none',
          transition: 'width 0.3s ease, height 0.3s ease',
        }} />
      </div>
    </div>
  );
}

// ─── Audio-driven waveform ─────────────────────────────────────────────────
function Waveform({ audioEl, active }: { audioEl: HTMLAudioElement | null; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!audioEl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let dataArray: Uint8Array<ArrayBuffer> | null = null;

    const setup = () => {
      try {
        const stream = audioEl.srcObject as MediaStream | null;
        if (!stream || stream.getAudioTracks().length === 0) return false;
        audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        // Autoplay policy can start the context suspended (no user gesture
        // yet) — bars would freeze at zero. Resume is async; best-effort.
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        const src = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.75;
        src.connect(analyser);
        dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        return true;
      } catch {
        return false;
      }
    };

    const NUM_BARS = 24;
    const CENTER_FALLOFF = (i: number) => {
      const c = (NUM_BARS - 1) / 2;
      return 1 - Math.abs(i - c) / c * 0.3;
    };

    const tick = () => {
      if (!analyser || !dataArray || !canvas || !ctx) return;
      analyser.getByteFrequencyData(dataArray);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const barW = w / NUM_BARS - 2;
      for (let i = 0; i < NUM_BARS; i++) {
        const idx = Math.floor((i / NUM_BARS) * dataArray.length * 0.7);
        const v = (dataArray[idx] / 255) * CENTER_FALLOFF(i);
        const barH = Math.max(2, v * h * 0.85);
        const x = i * (w / NUM_BARS) + 1;
        const y = (h - barH) / 2;

        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, `rgba(9,246,238,${0.3 + v * 0.6})`);
        grad.addColorStop(1, `rgba(54,201,197,${0.5 + v * 0.4})`);
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barW, barH);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    // The srcObject may not be attached yet on first run — retry once after it
    // lands. The retry must also START the render loop (a prior version set a
    // flag but never called tick(), leaving the waveform permanently dead).
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    if (setup()) {
      tick();
    } else {
      retryTimer = setTimeout(() => {
        if (setup()) tick();
      }, 500);
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioCtx?.close().catch(() => {});
    };
  }, [audioEl]);

  return (
    <canvas
      ref={canvasRef}
      width={240}
      height={60}
      style={{
        position: 'absolute',
        bottom: 36,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 200,
        height: 48,
        opacity: active ? 1 : 0.35,
        transition: 'opacity 0.4s',
        pointerEvents: 'none',
      }}
    />
  );
}
