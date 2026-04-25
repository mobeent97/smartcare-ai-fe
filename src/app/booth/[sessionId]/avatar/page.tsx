'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useBoothStore } from '@/store/booth';
import { AKOOLAvatarManager, getAvatarManager } from '@/lib/akool';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | 'avatar_speaking'
  | 'listening'
  | 'confirming'
  | 'processing'
  | 'tap_choice'
  | 'complete';

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

// ─── Speech Recognition ────────────────────────────────────────────────────────

interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((e: ISpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: { isFinal: boolean; [index: number]: { transcript: string } }[];
}

function createRecognition(): ISpeechRecognition | null {
  const SR =
    typeof window !== 'undefined'
      ? (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
      : null;
  if (!SR) return null;
  const r = new (SR as new () => ISpeechRecognition)();
  r.continuous = false;
  r.interimResults = true;
  r.lang = 'en-US';
  r.maxAlternatives = 1;
  return r;
}

// ─── Step Dots ─────────────────────────────────────────────────────────────────

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 22 : 7,
            height: 7,
            borderRadius: 4,
            background: i < current
              ? '#36c9c5'
              : i === current
                ? '#09f6ee'
                : 'rgba(9,246,238,0.18)',
            transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: i === current ? '0 0 8px rgba(9,246,238,0.6)' : 'none',
          }}
        />
      ))}
    </div>
  );
}

// ─── Waveform ─────────────────────────────────────────────────────────────────

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-end justify-center gap-[3px]" style={{ height: 32 }}>
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 3,
            borderRadius: 2,
            background: active
              ? `rgba(9,246,238,${0.4 + (i % 3) * 0.2})`
              : 'rgba(9,246,238,0.15)',
            height: active ? undefined : 5,
            animation: active ? `wv 0.9s ease-in-out ${i * 0.055}s infinite` : 'none',
            minHeight: 4,
          }}
        />
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AvatarConversationPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();

  const { akoolSessionId, setAkoolSessionId, setAvatarStatus, avatarStatus } = useBoothStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('avatar_speaking');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [history, setHistory] = useState<{ q: string; a: string }[]>([]);
  const [error, setError] = useState('');
  const [sttSupported, setSttSupported] = useState(true);
  const [fallbackText, setFallbackText] = useState('');
  const [showFallback, setShowFallback] = useState(false);

  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentForStepRef = useRef(-1);
  const introSentRef = useRef(false);   // prevent intro double-send and gate step speech

  const step = STEPS[stepIndex];
  const isLive = avatarStatus === 'live';
  const isConnecting = avatarStatus === 'connecting';

  const INTRO_SCRIPT =
    "Hello! I'm Nurse AI, your virtual triage assistant at SmartCare. " +
    "I'm here to ask you a few quick questions about how you're feeling today, " +
    "so we can make sure you get the right care as quickly as possible. " +
    "Please speak your answers clearly, and take your time — there's no rush. " +
    "Let's get started.";

  // ── When avatar goes live: play intro → then first step question ──
  useEffect(() => {
    if (avatarStatus !== 'live' || introSentRef.current) return;
    introSentRef.current = true;

    getAvatarManager()?.speak(INTRO_SCRIPT).catch(() => {});

    // After intro finishes, speak step 0 question
    const timer = setTimeout(() => {
      sentForStepRef.current = 0;
      const text = STEPS[0]?.question;
      if (text) getAvatarManager()?.speak(text).catch(() => {});
    }, INTRO_SCRIPT.length * 52 + 1500);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarStatus]);

  // ── On step change: speak question via stream ──
  useEffect(() => {
    if (stepIndex === 0) return; // step 0 handled by intro flow above
    if (!introSentRef.current) return;
    const text = STEPS[stepIndex]?.question;
    if (text) getAvatarManager()?.speak(text).catch(() => {});
  }, [stepIndex]);

  // ── Init AKOOL on mount with real video element ──
  useEffect(() => {
    if (!sessionId || !mainVideoRef.current) return;
    setAvatarStatus('connecting');
    const manager = new AKOOLAvatarManager({
      sessionId,
      avatarType: 'nurse',
      videoElement: mainVideoRef.current,
      onConnectionChange: (state) =>
        setAvatarStatus(state === 'connected' ? 'live' : state === 'connecting' ? 'connecting' : 'idle'),
      onError: () => setAvatarStatus('idle'),
    });
    manager.initialize()
      .then(({ akoolSessionId }) => setAkoolSessionId(akoolSessionId))
      .catch((err) => {
        if ((err as Error & { _cancelled?: boolean })?._cancelled) return; // StrictMode cleanup, ignore
        console.error('[AKOOL] initialize failed:', err);
      });
    return () => { manager.destroy().catch(() => {}); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── STT support check ──
  useEffect(() => {
    setSttSupported(!!createRecognition());
  }, []);

  // ── On step change: set phase + listening timer (TTS handled separately above) ──
  useEffect(() => {
    if (stepIndex >= STEPS.length) return;
    setTranscript('');
    setInterimTranscript('');
    setError('');
    setPhase('avatar_speaking');
    const s = STEPS[stepIndex];
    const estimatedMs = Math.max(3000, s.question.length * 55);
    speakTimerRef.current = setTimeout(() => {
      setPhase(s.inputType === 'tap' ? 'tap_choice' : 'listening');
    }, estimatedMs);
    return () => { if (speakTimerRef.current) clearTimeout(speakTimerRef.current); };
  }, [stepIndex]);

  // ── Mic ──
  function startListening() {
    const r = createRecognition();
    if (!r) { setShowFallback(true); return; }
    setTranscript('');
    setInterimTranscript('');
    setPhase('listening');
    r.onresult = (e: ISpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (final) setTranscript((prev) => (prev + ' ' + final).trim());
      setInterimTranscript(interim);
    };
    r.onend = () => { setInterimTranscript(''); setPhase('confirming'); };
    r.onerror = (e: { error?: string }) => {
      const code = e?.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setError('Microphone access denied. Please allow microphone permission and try again, or use keyboard input below.');
        setShowFallback(true);
      }
      setPhase('confirming');
    };
    recognitionRef.current = r;
    r.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setPhase('confirming');
  }

  // ── Submit ──
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
        if (avatar_speech_text) await getAvatarManager()?.speak(avatar_speech_text);
        router.push(`/booth/${sessionId}/results`);
        return;
      }
      setStepIndex((i) => i + 1);
    } catch {
      setError('Something went wrong. Please try again.');
      setPhase(step.inputType === 'tap' ? 'tap_choice' : 'listening');
    }
  }

  const isSpeaking = phase === 'avatar_speaking';

  return (
    <>
      <style>{`
        @keyframes wv { 0%,100%{height:5px} 50%{height:26px} }
        @keyframes speak-ring {
          0%,100% { transform:scale(1); opacity:0.5; }
          50%      { transform:scale(1.06); opacity:1; }
        }
        @keyframes speak-ring2 {
          0%,100% { transform:scale(1); opacity:0.25; }
          50%      { transform:scale(1.1); opacity:0.6; }
        }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fade-up {
          from { opacity:0; transform:translateY(14px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes mic-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(9,246,238,0.35); }
          50%      { box-shadow: 0 0 0 20px rgba(9,246,238,0); }
        }
        @keyframes status-dot {
          0%,100% { transform:scale(1); opacity:1; }
          50%      { transform:scale(1.4); opacity:0.6; }
        }
        @keyframes connect-spin {
          to { transform:rotate(360deg); }
        }
        @keyframes video-glow {
          0%,100% { box-shadow: 0 0 30px 6px rgba(9,246,238,0.12), 0 0 60px 12px rgba(9,246,238,0.06); }
          50%      { box-shadow: 0 0 40px 10px rgba(9,246,238,0.22), 0 0 80px 20px rgba(9,246,238,0.1); }
        }
        .fade-up  { animation: fade-up 0.4s ease both; }
        .mic-live { animation: mic-pulse 1.2s ease-in-out infinite; }
      `}</style>

      <div className="booth-kiosk min-h-screen flex flex-col" style={{ background: 'var(--color-dash-bg)' }}>

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
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
          {/* Logo */}
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
          </div>

          {/* Step dots */}
          <StepDots total={STEPS.length} current={stepIndex} />

          {/* Emergency */}
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
              letterSpacing: '0.02em',
            }}
          >
            <span style={{ fontSize: 14 }}>🚨</span>
            Emergency
          </button>
        </header>

        {/* ── Main layout ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center" style={{ padding: '32px 20px 24px', gap: 28 }}>

          {/* ── Avatar video — center stage ─────────────────────────────── */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Outer glow rings */}
            <div style={{
              position: 'absolute', inset: -20, borderRadius: 36,
              border: `1.5px solid rgba(9,246,238,${isSpeaking ? '0.35' : '0.1'})`,
              animation: isSpeaking ? 'speak-ring 1.6s ease-in-out infinite' : 'none',
              transition: 'border-color 0.4s',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', inset: -38, borderRadius: 44,
              border: `1px solid rgba(9,246,238,${isSpeaking ? '0.18' : '0.05'})`,
              animation: isSpeaking ? 'speak-ring2 1.6s ease-in-out infinite 0.4s' : 'none',
              transition: 'border-color 0.4s',
              pointerEvents: 'none',
            }} />

            {/* Video card */}
            <div style={{
              width: 'min(380px, 90vw)',
              height: 'min(460px, 52vw)',
              minHeight: 260,
              borderRadius: 28,
              overflow: 'hidden',
              border: `2px solid rgba(9,246,238,${isLive ? '0.35' : '0.12'})`,
              background: 'var(--color-dash-card)',
              position: 'relative',
              animation: isLive ? 'video-glow 3s ease-in-out infinite' : 'none',
              transition: 'border-color 0.5s',
            }}>
              {/* Live video */}
              <video
                ref={mainVideoRef}
                autoPlay
                playsInline
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  display: isLive ? 'block' : 'none',
                }}
              />

              {/* Connecting spinner */}
              {isConnecting && !isLive && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 16, background: 'var(--color-dash-card)',
                }}>
                  <div style={{ position: 'relative', width: 64, height: 64 }}>
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      border: '2px solid rgba(9,246,238,0.1)',
                      borderTop: '2px solid #09f6ee',
                      animation: 'connect-spin 1s linear infinite',
                    }} />
                    <div style={{
                      position: 'absolute', inset: 10, borderRadius: '50%',
                      border: '1.5px solid rgba(54,201,197,0.15)',
                      borderBottom: '1.5px solid #36c9c5',
                      animation: 'connect-spin 1.4s linear infinite reverse',
                    }} />
                    <svg style={{ position: 'absolute', inset: 18 }} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#09f6ee" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#09f6ee', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                      Connecting Avatar
                    </p>
                    <p style={{ color: 'rgba(9,246,238,0.45)', fontSize: 11 }}>
                      Nurse AI is warming up…
                    </p>
                  </div>
                </div>
              )}

              {/* Idle placeholder */}
              {!isLive && !isConnecting && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 14,
                }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: 'rgba(9,246,238,0.06)',
                    border: '1.5px solid rgba(9,246,238,0.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#09f6ee" strokeWidth="1.2" opacity="0.6">
                      <circle cx="12" cy="8" r="4"/>
                      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                    </svg>
                  </div>
                  <p style={{ color: 'rgba(9,246,238,0.4)', fontSize: 12, fontWeight: 600 }}>Nurse AI</p>
                </div>
              )}

              {/* Live badge */}
              {isLive && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'rgba(5,20,20,0.75)',
                  border: '1px solid rgba(9,246,238,0.3)',
                  borderRadius: 20,
                  padding: '4px 10px',
                  backdropFilter: 'blur(8px)',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#09f6ee',
                    animation: 'status-dot 1.5s ease-in-out infinite',
                    display: 'block',
                  }} />
                  <span style={{ color: '#09f6ee', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Live
                  </span>
                </div>
              )}

              {/* Gradient overlay bottom */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
                background: 'linear-gradient(to top, rgba(5,20,20,0.7) 0%, transparent 100%)',
                pointerEvents: 'none',
              }} />
            </div>

            {/* Phase status pill */}
            <div style={{
              marginTop: 14,
              display: 'flex', alignItems: 'center', gap: 7,
              background: 'var(--color-dash-card)',
              border: `1px solid rgba(9,246,238,${isSpeaking ? '0.4' : '0.15'})`,
              borderRadius: 20,
              padding: '5px 14px',
              transition: 'all 0.3s',
            }}>
              {isSpeaking && (
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#09f6ee',
                  animation: 'status-dot 1s ease-in-out infinite',
                  display: 'block',
                  flexShrink: 0,
                }} />
              )}
              <span style={{
                color: isSpeaking ? '#09f6ee' : '#5dd5d3',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>
                {isSpeaking
                  ? 'Nurse AI Speaking'
                  : phase === 'listening'
                    ? 'Listening…'
                    : phase === 'processing'
                      ? 'Processing…'
                      : 'Nurse AI'}
              </span>
            </div>
          </div>

          {/* ── Content area ─────────────────────────────────────────────── */}
          <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Step label */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{
                color: 'rgba(9,246,238,0.45)',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                fontFamily: 'monospace',
              }}>
                Step {stepIndex + 1} of {STEPS.length}
              </span>
              {history.length > 0 && (
                <span style={{ color: 'rgba(9,246,238,0.3)', fontSize: 10 }}>
                  {history.length} answered
                </span>
              )}
            </div>

            {/* Question bubble */}
            <div
              key={stepIndex}
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
              {/* Subtle left accent */}
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                background: isSpeaking
                  ? 'linear-gradient(to bottom, #09f6ee, #36c9c5)'
                  : 'rgba(9,246,238,0.2)',
                borderRadius: '18px 0 0 18px',
                transition: 'background 0.4s',
              }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingLeft: 8 }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>🩺</span>
                <p style={{
                  color: '#e0fffe',
                  fontSize: 15,
                  lineHeight: 1.65,
                  fontWeight: 500,
                }}>
                  {step?.question}
                </p>
              </div>
            </div>

            {/* ── TAP choice ── */}
            {(phase === 'tap_choice' || phase === 'avatar_speaking') && step?.inputType === 'tap' && (
              <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {step.tapOptions?.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => submitAnswer(opt.value)}
                    disabled={phase !== 'tap_choice'}
                    style={{
                      background: opt.danger
                        ? 'rgba(220,38,38,0.08)'
                        : 'rgba(34,197,94,0.07)',
                      border: `1.5px solid ${opt.danger ? 'rgba(220,38,38,0.4)' : 'rgba(34,197,94,0.35)'}`,
                      borderRadius: 14,
                      padding: '18px 24px',
                      color: opt.danger ? '#fca5a5' : '#86efac',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: phase !== 'tap_choice' ? 'not-allowed' : 'pointer',
                      opacity: phase === 'avatar_speaking' ? 0.45 : 1,
                      transition: 'all 0.15s',
                      textAlign: 'center',
                      width: '100%',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
                {phase === 'avatar_speaking' && (
                  <p style={{ color: 'rgba(9,246,238,0.4)', fontSize: 11, textAlign: 'center' }}>
                    Listen to the question first…
                  </p>
                )}
              </div>
            )}

            {/* ── Voice input ── */}
            {step?.inputType === 'voice' && (
              <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>

                {/* Mic button + waveform */}
                {(phase === 'listening' || phase === 'confirming' || phase === 'avatar_speaking') && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
                    <button
                      onClick={phase === 'listening' ? stopListening : startListening}
                      disabled={phase === 'avatar_speaking'}
                      className={phase === 'listening' ? 'mic-live' : ''}
                      style={{
                        width: 88,
                        height: 88,
                        borderRadius: '50%',
                        border: `2.5px solid ${phase === 'listening' ? '#09f6ee' : 'rgba(9,246,238,0.25)'}`,
                        background: phase === 'listening'
                          ? 'radial-gradient(circle, rgba(9,246,238,0.18) 0%, rgba(54,201,197,0.08) 100%)'
                          : 'rgba(9,246,238,0.04)',
                        cursor: phase === 'avatar_speaking' ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s',
                        opacity: phase === 'avatar_speaking' ? 0.35 : 1,
                        flexShrink: 0,
                      }}
                    >
                      {phase === 'listening' ? (
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#09f6ee" strokeWidth="2" strokeLinecap="round">
                          <rect x="9" y="2" width="6" height="12" rx="3"/>
                          <path d="M5 10a7 7 0 0 0 14 0"/>
                          <line x1="12" y1="17" x2="12" y2="21"/>
                          <line x1="8" y1="21" x2="16" y2="21"/>
                        </svg>
                      ) : (
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="rgba(9,246,238,0.5)" stroke="#09f6ee" strokeWidth="1.5" strokeLinecap="round">
                          <rect x="9" y="2" width="6" height="12" rx="3"/>
                          <path d="M5 10a7 7 0 0 0 14 0"/>
                          <line x1="12" y1="17" x2="12" y2="21"/>
                          <line x1="8" y1="21" x2="16" y2="21"/>
                        </svg>
                      )}
                    </button>

                    <Waveform active={phase === 'listening'} />

                    <p style={{
                      color: phase === 'listening' ? '#09f6ee' : 'rgba(9,246,238,0.45)',
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}>
                      {phase === 'listening'
                        ? 'Listening — tap to stop'
                        : phase === 'avatar_speaking'
                          ? 'Please wait…'
                          : 'Tap to speak'}
                    </p>
                  </div>
                )}

                {/* Transcript */}
                {(transcript || interimTranscript) && (
                  <div style={{
                    width: '100%',
                    background: 'rgba(9,246,238,0.03)',
                    border: '1px solid rgba(9,246,238,0.12)',
                    borderRadius: 12,
                    padding: '12px 16px',
                    minHeight: 50,
                  }}>
                    <p style={{ color: '#f0fffe', fontSize: 14, lineHeight: 1.55, fontFamily: 'monospace' }}>
                      {transcript}
                      {interimTranscript && (
                        <span style={{ color: 'rgba(9,246,238,0.4)' }}> {interimTranscript}</span>
                      )}
                    </p>
                  </div>
                )}

                {/* Confirm / re-record */}
                {phase === 'confirming' && transcript && (
                  <div className="fade-up" style={{ display: 'flex', gap: 10, width: '100%' }}>
                    <button
                      onClick={() => submitAnswer(transcript)}
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #36c9c5, #09f6ee)',
                        border: 'none',
                        borderRadius: 12,
                        padding: '14px 0',
                        color: '#051414',
                        fontSize: 14,
                        fontWeight: 800,
                        cursor: 'pointer',
                        letterSpacing: '0.02em',
                      }}
                    >
                      ✓ Confirm
                    </button>
                    <button
                      onClick={() => { setTranscript(''); setPhase('listening'); startListening(); }}
                      style={{
                        flex: 1,
                        background: 'rgba(9,246,238,0.05)',
                        border: '1px solid rgba(9,246,238,0.18)',
                        borderRadius: 12,
                        padding: '14px 0',
                        color: '#09f6ee',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ↺ Re-record
                    </button>
                  </div>
                )}

                {/* Keyboard fallback toggle */}
                {!showFallback && (
                  <button
                    onClick={() => setShowFallback(true)}
                    style={{ color: 'rgba(9,246,238,0.3)', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {sttSupported ? 'Use keyboard instead' : 'Voice not supported — type here'}
                  </button>
                )}

                {/* Keyboard input */}
                {showFallback && (
                  <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                    <textarea
                      value={fallbackText}
                      onChange={(e) => setFallbackText(e.target.value)}
                      placeholder="Type your answer here…"
                      rows={3}
                      style={{
                        width: '100%',
                        background: 'var(--color-dash-card)',
                        border: '1px solid rgba(9,246,238,0.18)',
                        borderRadius: 12,
                        padding: '12px 16px',
                        color: '#f0fffe',
                        fontSize: 14,
                        outline: 'none',
                        resize: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                    <button
                      onClick={() => submitAnswer(fallbackText)}
                      disabled={!fallbackText.trim()}
                      style={{
                        background: fallbackText.trim()
                          ? 'linear-gradient(135deg, #36c9c5, #09f6ee)'
                          : 'rgba(9,246,238,0.08)',
                        border: 'none',
                        borderRadius: 12,
                        padding: '13px 0',
                        color: fallbackText.trim() ? '#051414' : 'rgba(9,246,238,0.3)',
                        fontSize: 14,
                        fontWeight: 800,
                        cursor: fallbackText.trim() ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Submit Answer
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Processing */}
            {phase === 'processing' && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                <div style={{
                  width: 32, height: 32,
                  border: '2.5px solid rgba(9,246,238,0.12)',
                  borderTop: '2.5px solid #09f6ee',
                  borderRadius: '50%',
                  animation: 'spin 0.9s linear infinite',
                }} />
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                background: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.3)',
                borderRadius: 10,
                padding: '10px 14px',
                color: '#fca5a5',
                fontSize: 13,
              }}>
                {error}
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom safe area ─────────────────────────────────────────────── */}
        <div style={{ height: 12, flexShrink: 0 }} />
      </div>
    </>
  );
}
