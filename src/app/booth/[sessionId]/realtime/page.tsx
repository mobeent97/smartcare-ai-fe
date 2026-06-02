'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { RealtimeClient, type ToolDispatcher } from '@/lib/openai-realtime';
import {
  createAvatarManager,
  getConfiguredProvider,
  type AvatarManager,
  type AvatarVisualState,
} from '@/lib/avatar-manager';
import { streamLog } from '@/lib/stream-log';

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
  userTranscriptAt: number | null;
  speakStartAt: number | null;
}

export default function RealtimeBoothPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sessionId } = useParams<{ sessionId: string }>();
  const debugEnabled = searchParams.get('debug') === '1';

  // HYBRID mode: when a live avatar provider (akool/heygen) is configured, the
  // OpenAI Realtime model is used only as the BRAIN — mic VAD + transcript text
  // + tool calls. Its spoken audio is muted, and each completed assistant text
  // is spoken by the live avatar so the face actually lipsyncs. With provider
  // 'video' we keep the original behaviour: OpenAI voice + mp4 loops.
  const provider = getConfiguredProvider();
  const HYBRID = provider !== 'video';

  const [phase, setPhase] = useState<Phase>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantSubtitle, setAssistantSubtitle] = useState('');
  const [assistantTurnId, setAssistantTurnId] = useState(0);
  const [emergencyTriggered, setEmergencyTriggered] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [triageDone, setTriageDone] = useState(false);

  // Debug / telemetry
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [turnLatencies, setTurnLatencies] = useState<number[]>([]);
  const turnTimingRef = useRef<TurnTiming>({ userTranscriptAt: null, speakStartAt: null });
  const toolCallCountRef = useRef<Record<string, number>>({});

  const clientRef = useRef<RealtimeClient | null>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const assistantBufRef = useRef('');

  // Live-avatar (hybrid) wiring
  const [avatarState, setAvatarState] = useState<AvatarVisualState>('idle');
  const [avatarOpened, setAvatarOpened] = useState(false); // true once the live stream has rendered a frame
  const avatarVideoRef = useRef<HTMLVideoElement>(null);
  const avatarMgrRef = useRef<AvatarManager | null>(null);
  const triageDoneRef = useRef(false); // gate avatar reopen once triage is COMPLETED (create 403s on a non-IN_PROGRESS session)
  const speakStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioStartedAtRef = useRef<number>(0);
  // After complete_triage we must wait for the avatar to FINISH the closing
  // wait-time line before navigating to results — a blind timer cut it off
  // mid-speech. Set pending=true; each finished speech (re)arms a short
  // debounce, so the last spoken line wins. Hard fallback guards a stuck stream.
  const redirectPendingRef = useRef(false);
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
      submit_answer: async ({ step, value }) => {
        const key = `submit_answer:${step}`;
        const block = overBudget(key, PER_TOOL_LIMIT.submit_answer);
        if (block) return { ok: false, error: block, guidance: block };
        trackToolCall(key);
        try {
          const res = await api.submitAnswer(sessionId, step, value, 'realtime');
          const d = res.data;
          setCompletedSteps((prev) => {
            if (prev.has(step)) return prev;
            const next = new Set(prev);
            next.add(step);
            return next;
          });
          // Backend flips status→COMPLETED on the final answer (next_step
          // end/results), BEFORE the model calls complete_triage. Stop reopening
          // the avatar now so the post-answer response event can't 403 on a
          // non-IN_PROGRESS session — but the still-live stream keeps speaking
          // the closing lines (preventReopen, not a teardown).
          if (d.next_step === 'end' || d.next_step === 'results') {
            triageDoneRef.current = true;
            avatarMgrRef.current?.preventReopen?.();
          }
          return {
            ok: true,
            next_step: d.next_step,
            next_question: d.next_question,
            ctas_level: d.ctas_level,
            guidance: d.next_question
              ? `Acknowledge briefly, then ask: "${d.next_question}"`
              : d.next_step === 'end' || d.next_step === 'results'
                ? 'All required questions answered. Now call complete_triage.'
                : 'Continue the conversation naturally.',
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'submit_answer failed';
          return { ok: false, error: msg, guidance: 'Apologize briefly and try a different question.' };
        }
      },
      update_answer: async ({ step, value }) => {
        const key = `update_answer:${step}`;
        const block = overBudget(key, PER_TOOL_LIMIT.submit_answer);
        if (block) return { ok: false, error: block, guidance: block };
        trackToolCall(key);
        try {
          const res = await api.updateAnswer(sessionId, step, value);
          return res.data; // { ok, step, guidance }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'update_answer failed';
          return { ok: false, error: msg, guidance: 'Briefly acknowledge and continue.' };
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
          const msg = e instanceof Error ? e.message : 'measurement failed';
          return { ok: false, error: msg, guidance: 'Apologize, skip this reading, and continue.' };
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
          const msg = e instanceof Error ? e.message : 'flag_emergency failed';
          return { ok: false, error: msg, guidance: 'Tell the patient calmly that help is coming. Do not retry.' };
        }
      },
      complete_triage: async () => {
        const block = overBudget('complete_triage', PER_TOOL_LIMIT.complete_triage);
        if (block) return { ok: false, error: block, guidance: block };
        trackToolCall('complete_triage');
        try {
          setTriageDone(true);
          triageDoneRef.current = true;
          // Triage is done → the session leaves IN_PROGRESS, so minting a new
          // avatar session would 403. Stop reopening but KEEP the live stream so
          // it can speak the closing wait-time line; it's torn down on redirect/
          // unmount below.
          avatarMgrRef.current?.preventReopen?.();
          const res = await api.completeTriage(sessionId);
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
          const msg = e instanceof Error ? e.message : 'complete_triage failed';
          return { ok: false, error: msg, guidance: 'Apologize and tell the patient a clinician will be with them soon.' };
        }
      },
    };

    let reconnectAttempts = 0;
    let mintInFlight = false;
    const MAX_RECONNECTS = 1;

    const connectClient = async () => {
      // Guard against React StrictMode double-mount + Fast Refresh causing
      // two simultaneous mints — each one burns an OpenAI Realtime session
      // and trips the per-IP throttle.
      if (mintInFlight) return;
      mintInFlight = true;
      try {
        const mint = await api.createRealtimeSession(sessionId);
        if (cancelled) return;

        const client = new RealtimeClient(
          mint,
          {
            onConnected: () => {
              if (cancelled) return;
              reconnectAttempts = 0;            // healthy connection resets budget
              pushDebug('connected');
              // Hybrid: hold the model's first utterance until the AKOOL stream is
              // actually live. Otherwise OpenAI greets (and may run ahead) while
              // the avatar is still connecting — speech queues and replays out of
              // sync once the stream publishes.
              if (HYBRID && avatarMgrRef.current?.ensureReady) {
                setPhase('connecting');
                avatarMgrRef.current.ensureReady()
                  .catch(() => {})
                  .then(() => {
                    if (cancelled) return;
                    setPhase('listening');
                    client.startConversation();
                    pushDebug('avatar_ready_started');
                  });
              } else {
                setPhase('listening');
                client.startConversation();
              }
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
                setPhase('connecting');
                clientRef.current?.destroy();
                clientRef.current = null;
                connectClient();
                return;
              }
              setPhase('error');
              setErrorMsg(reason ?? 'Connection lost');
            },
            onUserTranscript: (text, isFinal) => {
              if (cancelled || !isFinal) return;
              turnTimingRef.current.userTranscriptAt = Date.now();
              setUserTranscript(text);
              pushDebug('user_transcript', text.slice(0, 80));
            },
            onAssistantTranscript: (delta) => {
              if (cancelled) return;
              assistantBufRef.current += delta;
              // Non-hybrid (video provider, OpenAI voice): subtitle tracks OpenAI
              // text. Hybrid: AKOOL's onSubtitle owns the subtitle so it stays in
              // sync with the avatar's actual speech.
              if (!HYBRID) setAssistantSubtitle(assistantBufRef.current);
            },
            onResponseStart: () => {
              if (cancelled) return;
              // New model response begins — reset the text buffer for this turn.
              assistantBufRef.current = '';
              // Non-hybrid clears the subtitle here; hybrid lets AKOOL's onSubtitle
              // own it (clears at the avatar's real speech end) so it doesn't blank
              // while the avatar is still speaking the previous line.
              if (!HYBRID) setAssistantSubtitle('');
              setAssistantTurnId((n) => n + 1);
              audioStartedAtRef.current = 0;
              if (speakStopTimerRef.current) {
                clearTimeout(speakStopTimerRef.current);
                speakStopTimerRef.current = null;
              }
              pushDebug('response_start');
            },
            onSpeakingStart: () => {
              if (cancelled) return;
              // Hybrid: OpenAI audio is muted; the live avatar owns the speaking
              // phase (set when we dispatch its speak() in onResponseComplete).
              if (HYBRID) return;
              // Fires per transcript delta — record true audio start once per turn.
              const t = turnTimingRef.current;
              if (t.speakStartAt) {
                setPhase('speaking');
                return;
              }
              const now = Date.now();
              if (t.userTranscriptAt) {
                const latency = now - t.userTranscriptAt;
                setTurnLatencies((prev) => [...prev.slice(-9), latency]);
                pushDebug('turn_latency_ms', String(latency));
                t.userTranscriptAt = null;
              }
              t.speakStartAt = now;
              audioStartedAtRef.current = now;
              setPhase('speaking');
              pushDebug('speaking_start');
            },
            onSpeakingStop: () => {
              if (cancelled) return;
              if (HYBRID) return; // avatar speak()-promise drives the phase back to listening
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
              // Hybrid: the full assistant text for this turn is now buffered.
              // Hand it to the live avatar to speak with real lipsync. Tool-call-
              // only responses carry no spoken text (hadAudio false) → skip.
              if (HYBRID) {
                const speech = assistantBufRef.current.trim();
                // After triage completes the avatar is in no-reopen mode: speak()
                // plays on the still-live stream (closing line) and silently
                // no-ops if the stream already closed — so it never 403s, and the
                // phase machine still advances back to listening either way.
                if (!hadAudio || !speech || !avatarMgrRef.current) {
                  // Closing turn carried no speech → don't hold the redirect
                  // waiting on it; go shortly.
                  if (redirectPendingRef.current) armRedirect(1500);
                  return;
                }
                setPhase('speaking');
                avatarMgrRef.current.speak(speech)
                  .then(() => {
                    if (cancelled) return;
                    setPhase((p) => (p === 'speaking' ? 'listening' : p));
                    // speak() resolves on AKOOL's audio_end → the closing line
                    // actually finished. Re-arm the (debounced) redirect.
                    if (redirectPendingRef.current) armRedirect(1200);
                  })
                  .catch(() => {
                    if (cancelled) return;
                    setPhase((p) => (p === 'speaking' ? 'listening' : p));
                    if (redirectPendingRef.current) armRedirect(1200);
                  });
                pushDebug('avatar_speak', `words=${speech.split(/\s+/).length}`);
                return;
              }
              if (!hadAudio || !audioStartedAtRef.current) return;
              // RTP audio plays in real time and keeps going for seconds after
              // response.done fires. Estimate total spoken duration from the
              // accumulated transcript: ~150 wpm ≈ 400 ms/word, plus a 1.2 s
              // tail to cover the model's natural ending pauses + jitter buffer.
              // Subtract however much has already played (now - audioStarted).
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
              setPhase((p) => (p === 'speaking' ? p : 'thinking'));
              // Hybrid: the patient finished a turn → the model is about to
              // respond. Warm the AKOOL stream NOW (no-op if already open) so a
              // reconnect after an idle-close overlaps with the model's thinking
              // instead of adding its ~2-3s join to the visible gap.
              if (HYBRID && !triageDoneRef.current) avatarMgrRef.current?.ensureOpen().catch(() => {});
              pushDebug('user_speech_stopped');
            },
            onError: (msg) => {
              if (cancelled) return;
              setErrorMsg(msg);
              pushDebug('error', msg);
            },
            onAudioElement: (el) => {
              // Hybrid: silence the OpenAI voice — the live avatar speaks instead.
              // The MediaStream still feeds the waveform analyser even when muted.
              if (HYBRID) { el.muted = true; el.volume = 0; }
              if (audioContainerRef.current) {
                audioContainerRef.current.innerHTML = '';
                audioContainerRef.current.appendChild(el);
              }
              setAudioEl(el);
            },
          },
          tools,
        );
        clientRef.current = client;
        await client.connect();
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Failed to start session';
        // A failed initial connect also burns a reconnect slot before giving up.
        if (reconnectAttempts < MAX_RECONNECTS) {
          reconnectAttempts++;
          pushDebug('reconnect_attempt', String(reconnectAttempts));
          setTimeout(() => { if (!cancelled) connectClient(); }, 1000);
          return;
        }
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

    // Build the live avatar (lazy — the AKOOL/HeyGen stream only opens on the
    // first speak() below, so nothing bills during connect). State changes drive
    // the on-screen video; the OpenAI brain feeds it text in onResponseComplete.
    if (HYBRID) {
      createAvatarManager(provider, {
        sessionId,
        avatarType: 'nurse',
        getVideoElement: () => avatarVideoRef.current,
        onStateChange: (s) => {
          if (cancelled) return;
          setAvatarState(s);
          if (s === 'speaking') setAvatarOpened(true);
        },
        // Drive the on-screen subtitle off AKOOL's REAL speech (word-by-word
        // during audio_start→audio_end), NOT OpenAI's generation — otherwise
        // the text races ahead of the avatar's voice while the stream loads.
        onSubtitle: (text) => { if (!cancelled) setAssistantSubtitle(text); },
        // Live session ended (duration cap / drop). Hide the live <video> and
        // show the connecting placeholder again; the next speak() reopens.
        onStreamClosed: () => {
          if (cancelled) return;
          setAvatarOpened(false);
          pushDebug('avatar_stream_closed');
        },
        onError: () => { if (!cancelled) pushDebug('avatar_error'); },
      })
        .then((m) => { if (cancelled) { m.destroy().catch(() => {}); return; } avatarMgrRef.current = m; })
        .catch(() => {});
    }

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
      avatarMgrRef.current?.destroy().catch(() => {});
      avatarMgrRef.current = null;
    };
  }, [sessionId, router]);

  // Beacon-close the billed live avatar session if the patient closes the tab
  // mid-conversation, so idle minutes don't bleed.
  useEffect(() => {
    if (!HYBRID) return;
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      const payload = avatarMgrRef.current?.beaconClosePayload();
      if (!payload) return;
      try {
        navigator.sendBeacon(
          api.getAvatarCloseUrl(),
          new Blob([JSON.stringify(payload)], { type: 'application/json' }),
        );
      } catch { /* best-effort */ }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [HYBRID]);

  const isSpeaking = phase === 'speaking';
  // Map conversation phase to one of the three pre-recorded loops (video
  // provider). In hybrid the live avatar reports its own visual state.
  const videoState: 'idle' | 'speaking' | 'listening' = HYBRID
    ? avatarState
    : phase === 'speaking' ? 'speaking'
      : phase === 'listening' ? 'listening'
        : 'idle';
  const phaseLabel = phase === 'speaking'
    ? 'Nurse AI Speaking'
    : phase === 'listening'
      ? 'Listening…'
      : phase === 'thinking'
        ? 'Thinking…'
        : phase === 'connecting'
          ? 'Connecting…'
          : 'Disconnected';

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
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
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
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(220,38,38,0.1)',
              border: '1px solid rgba(220,38,38,0.4)',
              borderRadius: 8,
              padding: '6px 14px',
              color: '#fca5a5',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <span style={{ fontSize: 14 }}>🚨</span>
            Emergency
          </button>
        </header>

        {/* ── Progress strip ── */}
        <ProgressStrip completed={completedSteps} done={triageDone} />

        {/* ── Main ── */}
        <div className="flex-1 flex flex-col items-center" style={{ padding: '32px 20px 24px', gap: 28 }}>

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
            <div style={{
              width: 320,
              height: 320,
              borderRadius: 24,
              overflow: 'hidden',
              border: '2px solid rgba(9,246,238,0.35)',
              background: 'var(--color-dash-card)',
              position: 'relative',
              animation: 'orb-glow 3s ease-in-out infinite',
            }}>
              {HYBRID ? (
                <>
                  {/* Connecting placeholder — NO local video in live-avatar mode.
                      Shows until the AKOOL stream renders its first frame, and
                      again if the session reopens mid-flow. */}
                  <div
                    style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 14,
                      background: 'radial-gradient(circle at 50% 40%, rgba(9,246,238,0.06), var(--color-dash-card))',
                      opacity: avatarOpened ? 0 : 1,
                      transition: 'opacity 0.4s ease',
                      pointerEvents: 'none',
                    }}
                  >
                    <div style={{
                      width: 46, height: 46, borderRadius: '50%',
                      border: '3px solid rgba(9,246,238,0.18)',
                      borderTopColor: '#09f6ee',
                      animation: 'spin 0.9s linear infinite',
                    }} />
                    <span style={{ color: 'rgba(134,223,220,0.7)', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }}>
                      Connecting to Nurse AI…
                    </span>
                  </div>
                  {/* Live AKOOL/HeyGen avatar — Agora attaches the remote stream here.
                      Muted: the avatar's voice plays via its own Agora audio track. */}
                  <video
                    ref={avatarVideoRef}
                    autoPlay playsInline muted
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      position: 'absolute', inset: 0,
                      opacity: avatarOpened ? 1 : 0,
                      transition: 'opacity 0.4s ease',
                    }}
                  />
                </>
              ) : (
                <>
                  <video
                    src="/avatar/idle.mp4"
                    autoPlay loop muted playsInline
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      position: 'absolute', inset: 0,
                      opacity: videoState === 'idle' ? 1 : 0,
                      transition: 'opacity 0.25s ease',
                    }}
                  />
                  <video
                    src="/avatar/speaking.mp4"
                    autoPlay loop muted playsInline
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      position: 'absolute', inset: 0,
                      opacity: videoState === 'speaking' ? 1 : 0,
                      transition: 'opacity 0.25s ease',
                    }}
                  />
                  <video
                    src="/avatar/listening.mp4"
                    autoPlay loop muted playsInline
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      position: 'absolute', inset: 0,
                      opacity: videoState === 'listening' ? 1 : 0,
                      transition: 'opacity 0.25s ease',
                    }}
                  />
                </>
              )}

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
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>🩺</span>
                  <p style={{ color: '#e0fffe', fontSize: 15, lineHeight: 1.65, fontWeight: 500, margin: 0 }}>
                    {assistantSubtitle}
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
                <p style={{ color: '#fca5a5', fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Connection issue</p>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 12 }}>{errorMsg}</p>
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

    let setupOk = setup();
    if (!setupOk) {
      // Retry once after stream attaches
      const retry = setTimeout(() => { setupOk = setup(); }, 500);
      return () => clearTimeout(retry);
    }

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
    tick();

    return () => {
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
