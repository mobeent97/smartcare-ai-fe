'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { RealtimeClient, type ToolDispatcher } from '@/lib/openai-realtime';

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

  const [phase, setPhase] = useState<Phase>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantSubtitle, setAssistantSubtitle] = useState('');
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

    const tools: ToolDispatcher = {
      submit_answer: async ({ step, value }) => {
        trackToolCall(`submit_answer:${step}`);
        const res = await api.submitAnswer(sessionId, step, value, 'realtime');
        const d = res.data;
        setCompletedSteps((prev) => {
          if (prev.has(step)) return prev;
          const next = new Set(prev);
          next.add(step);
          return next;
        });
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
      },
      trigger_measurement: async ({ device_type }) => {
        trackToolCall(`trigger_measurement:${device_type}`);
        setCompletedSteps((prev) => {
          if (prev.has('vitals')) return prev;
          const next = new Set(prev);
          next.add('vitals');
          return next;
        });
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
      },
      flag_emergency: async ({ reason }) => {
        trackToolCall('flag_emergency');
        await api.submitAnswer(sessionId, 'first_look', 'yes', 'realtime');
        setEmergencyTriggered(true);
        return {
          ok: true,
          escalated: true,
          reason,
          guidance: 'Emergency alert sent to staff. Tell the patient calmly that help is coming and to stay still. Do NOT call any further tools.',
        };
      },
      complete_triage: async () => {
        trackToolCall('complete_triage');
        setTriageDone(true);
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
        setTimeout(() => {
          if (!cancelled) router.push(`/booth/${sessionId}/results`);
        }, 4000);
        return {
          ok: true,
          ctas_level: ctas,
          routing_specialty: specialty,
          message_for_patient: ctas ? ctasMessage[ctas] : 'A clinician will see you soon.',
          guidance: 'Briefly tell the patient their wait time and where they will be seen. Then thank them and stop calling tools.',
        };
      },
    };

    (async () => {
      try {
        const mint = await api.createRealtimeSession(sessionId);
        if (cancelled) return;

        const client = new RealtimeClient(
          mint,
          {
            onConnected: () => {
              if (cancelled) return;
              setPhase('listening');
              client.startConversation();
              pushDebug('connected');
            },
            onDisconnected: (reason) => {
              if (cancelled) return;
              setPhase('error');
              setErrorMsg(reason ?? 'Connection lost');
              pushDebug('disconnected', reason);
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
              setAssistantSubtitle(assistantBufRef.current);
            },
            onResponseStart: () => {
              if (cancelled) return;
              // New model response begins — clear previous subtitle for fresh turn.
              assistantBufRef.current = '';
              setAssistantSubtitle('');
              pushDebug('response_start');
            },
            onSpeakingStart: () => {
              if (cancelled) return;
              // Fires per audio chunk; only run latency calc once per turn.
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
              setPhase('speaking');
              pushDebug('speaking_start');
            },
            onSpeakingStop: () => {
              if (cancelled) return;
              // Reset turn-start guard so next response measures latency fresh.
              turnTimingRef.current.speakStartAt = null;
              setPhase('listening');
              pushDebug('speaking_stop');
            },
            onListeningStart: () => {
              if (cancelled) return;
              setPhase('thinking');
              pushDebug('user_speech_started');
            },
            onError: (msg) => {
              if (cancelled) return;
              setErrorMsg(msg);
              pushDebug('error', msg);
            },
            onAudioElement: (el) => {
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
        setPhase('error');
        setErrorMsg(msg);
      }
    })();

    return () => {
      cancelled = true;
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, [sessionId, router]);

  const isSpeaking = phase === 'speaking';
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
            onClick={() => router.push(`/booth/${sessionId}/emergency`)}
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

          {/* Voice orb stage */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Outer rings */}
            <div style={{
              position: 'absolute', inset: -22, borderRadius: '50%',
              border: `1.5px solid rgba(9,246,238,${isSpeaking ? '0.4' : '0.1'})`,
              animation: isSpeaking ? 'speak-ring 1.6s ease-in-out infinite' : 'none',
              transition: 'border-color 0.4s',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', inset: -42, borderRadius: '50%',
              border: `1px solid rgba(9,246,238,${isSpeaking ? '0.2' : '0.05'})`,
              animation: isSpeaking ? 'speak-ring2 1.6s ease-in-out infinite 0.4s' : 'none',
              transition: 'border-color 0.4s',
              pointerEvents: 'none',
            }} />

            {/* Voice orb */}
            <div style={{
              width: 280,
              height: 280,
              borderRadius: '50%',
              border: '2px solid rgba(9,246,238,0.35)',
              background: 'radial-gradient(circle at 50% 40%, rgba(9,246,238,0.18) 0%, rgba(11,40,39,0.95) 60%, var(--color-dash-card) 100%)',
              position: 'relative',
              animation: 'orb-glow 3s ease-in-out infinite',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}>
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

              {/* Center icon — stethoscope */}
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#09f6ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
                <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.3.3 0 1 0 .2.3" />
                <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
                <circle cx="20" cy="10" r="2" />
              </svg>

              {/* Audio-driven waveform overlay */}
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
                key={assistantSubtitle.length}
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
