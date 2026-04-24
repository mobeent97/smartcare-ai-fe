'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useBoothStore } from '@/store/booth';
import { getAvatarManager } from '@/lib/akool';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | 'avatar_speaking'   // avatar TTS playing
  | 'listening'         // mic open, capturing voice
  | 'confirming'        // transcript ready, user reviews
  | 'processing'        // submitting to backend
  | 'tap_choice'        // YES/NO tap buttons (first_look)
  | 'complete';         // triage done

interface StepConfig {
  stepName: string;
  question: string;
  inputType: 'voice' | 'tap';
  tapOptions?: { label: string; value: string; danger?: boolean }[];
}

const STEPS: StepConfig[] = [
  {
    stepName: 'first_look',
    question: 'Before we begin — are you experiencing a life-threatening emergency right now? Chest pain, difficulty breathing, severe bleeding, or loss of consciousness?',
    inputType: 'tap',
    tapOptions: [
      { label: 'YES — I need emergency help', value: 'yes', danger: true },
      { label: 'NO — Continue assessment', value: 'no' },
    ],
  },
  {
    stepName: 'complaint',
    question: "What is your main reason for visiting today? Please describe what you're experiencing.",
    inputType: 'voice',
  },
  {
    stepName: 'demographics',
    question: 'How old are you, and what is your biological sex? For example: "I am 45 years old, male."',
    inputType: 'voice',
  },
  {
    stepName: 'symptom_detail',
    question: 'On a scale of 1 to 10, how severe would you say your symptoms are right now? And how long have you had them?',
    inputType: 'voice',
  },
];

// ─── Speech Recognition helper ────────────────────────────────────────────────

function createRecognition() {
  const SR =
    typeof window !== 'undefined'
      ? (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
      : null;
  if (!SR) return null;
  const r = new (SR as new () => SpeechRecognition)();
  r.continuous = false;
  r.interimResults = true;
  r.lang = 'en-US';
  r.maxAlternatives = 1;
  return r;
}

// ─── Waveform bars animation ───────────────────────────────────────────────────

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-center justify-center gap-[3px]" style={{ height: 28 }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 3,
            borderRadius: 3,
            background: active ? '#09f6ee' : 'rgba(9,246,238,0.25)',
            height: active ? undefined : 6,
            animation: active ? `wave-bar 0.8s ease-in-out infinite` : 'none',
            animationDelay: `${i * 0.07}s`,
            minHeight: 4,
          }}
        />
      ))}
    </div>
  );
}

// ─── Step progress dots ────────────────────────────────────────────────────────

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 20 : 8,
            height: 8,
            borderRadius: 4,
            background: i < current
              ? 'rgb(54,201,197)'
              : i === current
                ? 'rgb(9,246,238)'
                : 'rgba(9,246,238,0.2)',
            transition: 'all 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

// ─── Avatar video panel ────────────────────────────────────────────────────────

function AvatarVideo({ phase }: { phase: Phase }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { avatarStatus } = useBoothStore();

  useEffect(() => {
    const el = videoRef.current;
    if (el) getAvatarManager()?.attachVideo(el);
  }, []);

  const isLive = avatarStatus === 'live';
  const isConnecting = avatarStatus === 'connecting';
  const isSpeaking = phase === 'avatar_speaking';

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer speaking ring */}
      <div
        style={{
          position: 'absolute',
          inset: -8,
          borderRadius: '50%',
          border: `2px solid rgba(9,246,238,${isSpeaking ? '0.6' : '0.15'})`,
          animation: isSpeaking ? 'speak-ring 1.4s ease-in-out infinite' : 'none',
          transition: 'border-color 0.4s',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: -18,
          borderRadius: '50%',
          border: `1px solid rgba(9,246,238,${isSpeaking ? '0.3' : '0.07'})`,
          animation: isSpeaking ? 'speak-ring 1.4s ease-in-out infinite 0.4s' : 'none',
        }}
      />

      {/* Video container */}
      <div
        style={{
          width: 220,
          height: 280,
          borderRadius: 24,
          overflow: 'hidden',
          border: `2px solid rgba(9,246,238,${isLive ? '0.4' : '0.15'})`,
          background: '#0d1a2d',
          position: 'relative',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: isLive ? 'block' : 'none' }}
        />
        {isConnecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div style={{ width: 40, height: 40, border: '3px solid rgba(54,201,197,0.2)', borderTop: '3px solid #36c9c5', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span style={{ color: '#5dd5d3', fontSize: 12, fontWeight: 600 }}>Connecting…</span>
          </div>
        )}
        {!isLive && !isConnecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            {/* Placeholder avatar illustration */}
            <svg width="80" height="95" viewBox="0 0 80 95" fill="none">
              <circle cx="40" cy="30" r="22" fill="rgba(9,246,238,0.1)" stroke="#09f6ee" strokeWidth="1.5" opacity="0.7"/>
              <circle cx="33" cy="28" r="2.5" fill="#09f6ee" opacity="0.8"/>
              <circle cx="47" cy="28" r="2.5" fill="#09f6ee" opacity="0.8"/>
              <path d="M33 38 Q40 43 47 38" stroke="#09f6ee" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.8"/>
              <path d="M12 85 Q16 65 40 60 Q64 65 68 85" fill="rgba(9,246,238,0.07)" stroke="#09f6ee" strokeWidth="1.2" opacity="0.5"/>
              <rect x="36" y="65" width="8" height="14" rx="2" fill="#09f6ee" opacity="0.4"/>
              <rect x="32" y="69" width="16" height="6" rx="2" fill="#09f6ee" opacity="0.4"/>
            </svg>
            <span style={{ color: '#5dd5d3', fontSize: 11, fontWeight: 600 }}>Nurse AI</span>
          </div>
        )}
      </div>

      {/* Phase label */}
      <div
        style={{
          position: 'absolute',
          bottom: -14,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0b2827',
          border: `1px solid ${isSpeaking ? 'rgba(9,246,238,0.5)' : 'rgba(9,246,238,0.2)'}`,
          borderRadius: 20,
          padding: '3px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: isSpeaking ? '#09f6ee' : '#5dd5d3',
          whiteSpace: 'nowrap',
        }}
      >
        {isSpeaking ? '● Speaking' : phase === 'listening' ? '🎤 Listening' : 'Nurse AI'}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AvatarConversationPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('avatar_speaking');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [history, setHistory] = useState<{ q: string; a: string }[]>([]);
  const [error, setError] = useState('');
  const [sttSupported, setSttSupported] = useState(true);
  const [fallbackText, setFallbackText] = useState('');
  const [showFallback, setShowFallback] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = STEPS[stepIndex];

  // ── Speak via AKOOL avatar ──
  const speakQuestion = useCallback(async (text: string) => {
    setPhase('avatar_speaking');
    try {
      await api.sendAvatarMessage(sessionId, text);
    } catch { /* non-blocking — avatar speaks if connected */ }
    // After estimated speech duration, move to listening
    const estimatedMs = Math.max(3000, text.length * 55);
    speakTimerRef.current = setTimeout(() => {
      setPhase(step?.inputType === 'tap' ? 'tap_choice' : 'listening');
    }, estimatedMs);
  }, [sessionId, step]);

  // ── On step change: speak the question ──
  useEffect(() => {
    if (stepIndex >= STEPS.length) return;
    const s = STEPS[stepIndex];
    setTranscript('');
    setInterimTranscript('');
    setError('');
    speakQuestion(s.question);
    return () => { if (speakTimerRef.current) clearTimeout(speakTimerRef.current); };
  }, [stepIndex, speakQuestion]);

  // ── Check STT support ──
  useEffect(() => {
    const r = createRecognition();
    setSttSupported(!!r);
  }, []);

  // ── Start mic ──
  function startListening() {
    const r = createRecognition();
    if (!r) { setShowFallback(true); return; }
    setTranscript('');
    setInterimTranscript('');
    setPhase('listening');

    r.onresult = (e: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (final) setTranscript((prev) => (prev + ' ' + final).trim());
      setInterimTranscript(interim);
    };
    r.onend = () => {
      setInterimTranscript('');
      setPhase('confirming');
    };
    r.onerror = () => {
      setPhase('confirming');
    };

    recognitionRef.current = r;
    r.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setPhase('confirming');
  }

  // ── Submit answer ──
  async function submitAnswer(answer: string) {
    if (!answer.trim()) { setError('Please provide an answer before continuing.'); return; }
    setPhase('processing');
    setError('');
    try {
      const res = await api.submitAnswer(sessionId, step.stepName, answer.trim());
      const { next_step, avatar_speech_text } = res.data;

      setHistory((h) => [...h, { q: step.question, a: answer.trim() }]);

      if (step.stepName === 'first_look' && answer === 'yes') {
        router.push(`/booth/${sessionId}/emergency`);
        return;
      }
      if (next_step === 'results' || stepIndex >= STEPS.length - 1) {
        if (avatar_speech_text) await api.sendAvatarMessage(sessionId, avatar_speech_text);
        router.push(`/booth/${sessionId}/results`);
        return;
      }

      // Advance to next step — question spoken by useEffect above
      setStepIndex((i) => i + 1);
    } catch {
      setError('Something went wrong. Please try again.');
      setPhase(step.inputType === 'tap' ? 'tap_choice' : 'listening');
    }
  }

  return (
    <>
      <style>{`
        @keyframes speak-ring {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        @keyframes wave-bar {
          0%, 100% { height: 6px; }
          50% { height: 22px; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fade-up 0.4s ease both; }
        @keyframes mic-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(9,246,238,0.3); }
          50% { box-shadow: 0 0 0 18px rgba(9,246,238,0); }
        }
        .mic-active { animation: mic-pulse 1.2s ease-in-out infinite; }
      `}</style>

      <div
        className="min-h-screen flex flex-col"
        style={{ background: '#071c1c' }}
      >
        {/* ── Top bar ── */}
        <header
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            borderBottom: '1px solid rgba(9,246,238,0.08)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#09f6ee', fontWeight: 900, fontFamily: 'monospace', fontSize: 15 }}>
              SmartCare<span style={{ color: '#f0fffe' }}>AI</span>
            </span>
          </div>
          <StepDots total={STEPS.length} current={stepIndex} />
          {/* Emergency button */}
          <button
            onClick={() => router.push(`/booth/${sessionId}/emergency`)}
            style={{
              background: 'rgba(220,38,38,0.15)',
              border: '1px solid rgba(220,38,38,0.5)',
              borderRadius: 8,
              padding: '5px 12px',
              color: '#fca5a5',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🚨 Emergency
          </button>
        </header>

        {/* ── Main content ── */}
        <div
          className="flex-1 flex flex-col lg:flex-row overflow-hidden"
          style={{ minHeight: 0 }}
        >
          {/* ── Left: Avatar panel ── */}
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              minWidth: 280,
              background: 'linear-gradient(to bottom, #0d1a2d, #071c1c)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 24px',
              borderRight: '1px solid rgba(9,246,238,0.07)',
              flexShrink: 0,
            }}
            className="hidden lg:flex"
          >
            <AvatarVideo phase={phase} />

            {/* Chat history (last 2 entries) */}
            {history.length > 0 && (
              <div style={{ marginTop: 32, width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.slice(-2).map((h, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'rgba(9,246,238,0.04)',
                      border: '1px solid rgba(9,246,238,0.1)',
                      borderRadius: 10,
                      padding: '8px 12px',
                    }}
                  >
                    <p style={{ color: '#5dd5d3', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                      Your answer
                    </p>
                    <p style={{ color: '#c0f0ef', fontSize: 13, lineHeight: 1.4 }}>{h.a}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: Conversation panel ── */}
          <div
            className="flex-1 flex flex-col overflow-y-auto"
            style={{ padding: '32px 28px 24px' }}
          >
            {/* Mobile avatar (small, top) */}
            <div className="flex lg:hidden justify-center mb-6">
              <AvatarVideo phase={phase} />
            </div>

            {/* Step label */}
            <p style={{ color: 'rgba(9,246,238,0.5)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Step {stepIndex + 1} of {STEPS.length}
            </p>

            {/* Question bubble */}
            <div
              key={stepIndex}
              className="fade-up"
              style={{
                background: '#0b2827',
                border: '1px solid rgba(54,201,197,0.25)',
                borderRadius: 16,
                padding: '18px 20px',
                marginBottom: 24,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>🩺</span>
                <p style={{ color: '#e0fffe', fontSize: 16, lineHeight: 1.6, fontWeight: 500 }}>
                  {step?.question}
                </p>
              </div>
            </div>

            {/* ── TAP choice (first_look) ── */}
            {(phase === 'tap_choice' || phase === 'avatar_speaking') && step?.inputType === 'tap' && (
              <div className="fade-up flex flex-col gap-3 mt-2">
                {step.tapOptions?.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => submitAnswer(opt.value)}
                    disabled={phase === 'avatar_speaking' || phase === 'processing'}
                    style={{
                      background: opt.danger ? 'rgba(220,38,38,0.12)' : 'rgba(34,197,94,0.1)',
                      border: `2px solid ${opt.danger ? 'rgba(220,38,38,0.5)' : 'rgba(34,197,94,0.4)'}`,
                      borderRadius: 14,
                      padding: '20px 24px',
                      color: opt.danger ? '#fca5a5' : '#86efac',
                      fontSize: 17,
                      fontWeight: 700,
                      cursor: phase === 'avatar_speaking' ? 'not-allowed' : 'pointer',
                      opacity: phase === 'avatar_speaking' ? 0.5 : 1,
                      transition: 'all 0.15s',
                      textAlign: 'center',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
                {phase === 'avatar_speaking' && (
                  <p style={{ color: 'rgba(9,246,238,0.5)', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                    Please listen to the question first…
                  </p>
                )}
              </div>
            )}

            {/* ── Voice capture ── */}
            {step?.inputType === 'voice' && (
              <div className="fade-up flex flex-col items-center gap-5">

                {/* Mic button */}
                {(phase === 'listening' || phase === 'confirming' || phase === 'avatar_speaking') && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <button
                      onClick={phase === 'listening' ? stopListening : startListening}
                      disabled={phase === 'avatar_speaking' || phase === 'processing'}
                      className={phase === 'listening' ? 'mic-active' : ''}
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: '50%',
                        border: `3px solid ${phase === 'listening' ? '#09f6ee' : 'rgba(9,246,238,0.3)'}`,
                        background: phase === 'listening'
                          ? 'linear-gradient(135deg, rgba(9,246,238,0.2), rgba(54,201,197,0.3))'
                          : 'rgba(9,246,238,0.06)',
                        cursor: phase === 'avatar_speaking' ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        opacity: phase === 'avatar_speaking' ? 0.4 : 1,
                      }}
                    >
                      {phase === 'listening' ? (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#09f6ee" strokeWidth="2" strokeLinecap="round">
                          <rect x="9" y="2" width="6" height="12" rx="3"/>
                          <path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/>
                        </svg>
                      ) : (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(9,246,238,0.6)" stroke="#09f6ee" strokeWidth="1.5" strokeLinecap="round">
                          <rect x="9" y="2" width="6" height="12" rx="3"/>
                          <path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/>
                        </svg>
                      )}
                    </button>

                    <Waveform active={phase === 'listening'} />

                    <p style={{ color: 'rgba(9,246,238,0.6)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {phase === 'listening' ? 'Listening — tap to stop' : phase === 'avatar_speaking' ? 'Please wait…' : 'Tap to speak'}
                    </p>
                  </div>
                )}

                {/* Live interim transcript */}
                {(interimTranscript || transcript) && (
                  <div
                    style={{
                      width: '100%',
                      background: 'rgba(9,246,238,0.04)',
                      border: '1px solid rgba(9,246,238,0.15)',
                      borderRadius: 12,
                      padding: '12px 16px',
                      minHeight: 56,
                    }}
                  >
                    <p style={{ color: '#f0fffe', fontSize: 15, lineHeight: 1.5, fontFamily: 'monospace' }}>
                      {transcript}
                      {interimTranscript && (
                        <span style={{ color: 'rgba(9,246,238,0.5)' }}> {interimTranscript}</span>
                      )}
                    </p>
                  </div>
                )}

                {/* Confirm / re-record */}
                {phase === 'confirming' && transcript && (
                  <div className="fade-up flex gap-3 w-full">
                    <button
                      onClick={() => submitAnswer(transcript)}
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #36c9c5, #09f6ee)',
                        border: 'none',
                        borderRadius: 12,
                        padding: '14px 0',
                        color: '#051414',
                        fontSize: 15,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ✓ Confirm
                    </button>
                    <button
                      onClick={() => { setTranscript(''); setPhase('listening'); startListening(); }}
                      style={{
                        flex: 1,
                        background: 'rgba(9,246,238,0.06)',
                        border: '1px solid rgba(9,246,238,0.2)',
                        borderRadius: 12,
                        padding: '14px 0',
                        color: '#09f6ee',
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ↺ Re-record
                    </button>
                  </div>
                )}

                {/* Fallback text input toggle */}
                {!showFallback && (
                  <button
                    onClick={() => setShowFallback(true)}
                    style={{ color: 'rgba(9,246,238,0.4)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {sttSupported ? 'Use keyboard instead' : 'Voice not supported — type your answer'}
                  </button>
                )}

                {/* Fallback keyboard input */}
                {showFallback && (
                  <div className="fade-up flex flex-col gap-3 w-full">
                    <textarea
                      value={fallbackText}
                      onChange={(e) => setFallbackText(e.target.value)}
                      placeholder="Type your answer here…"
                      rows={3}
                      style={{
                        width: '100%',
                        background: '#0b2827',
                        border: '1px solid rgba(9,246,238,0.2)',
                        borderRadius: 12,
                        padding: '12px 16px',
                        color: '#f0fffe',
                        fontSize: 15,
                        outline: 'none',
                        resize: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                    <button
                      onClick={() => submitAnswer(fallbackText)}
                      disabled={!fallbackText.trim()}
                      style={{
                        background: 'linear-gradient(135deg, #36c9c5, #09f6ee)',
                        border: 'none',
                        borderRadius: 12,
                        padding: '14px 0',
                        color: '#051414',
                        fontSize: 15,
                        fontWeight: 700,
                        cursor: fallbackText.trim() ? 'pointer' : 'not-allowed',
                        opacity: fallbackText.trim() ? 1 : 0.5,
                      }}
                    >
                      Submit Answer
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Processing spinner */}
            {phase === 'processing' && (
              <div className="flex justify-center py-6">
                <div style={{ width: 36, height: 36, border: '3px solid rgba(9,246,238,0.15)', borderTop: '3px solid #09f6ee', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                style={{
                  background: 'rgba(220,38,38,0.1)',
                  border: '1px solid rgba(220,38,38,0.3)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: '#fca5a5',
                  fontSize: 13,
                  marginTop: 8,
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
