'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  createAvatarManager,
  getActiveAvatarManager,
  getConfiguredProvider,
  type AvatarVisualState,
} from '@/lib/avatar-manager';

// Provider chosen per deploy (kept in sync with backend AVATAR_PROVIDER).
// 'video' = mp4 loop (zero streaming cost, default); 'akool'/'heygen' = live.
const AVATAR_PROVIDER = getConfiguredProvider();
const IS_LIVE_AVATAR = AVATAR_PROVIDER !== 'video';
// Tear down a live (billed) stream after this much idle time; reopens on next speak.
const LIVE_IDLE_CLOSE_MS = 25_000;
// Wait after the avatar finishes before auto-opening the mic, so the audio tail
// doesn't bleed into the mic (the avatar hearing itself).
const POST_SPEECH_ECHO_GUARD_MS = 700;

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | 'avatar_speaking'
  | 'listening'
  | 'confirming'
  | 'processing'
  | 'thinking'
  | 'tap_choice'
  | 'complete';

interface StepConfig {
  stepName: string;
  question: string;
  inputType: 'voice' | 'tap' | 'vitals';
  tapOptions?: { label: string; value: string; danger?: boolean }[];
}

const STEPS: StepConfig[] = [
  {
    stepName: 'first_look',
    question: 'Before we begin — are you experiencing a life-threatening emergency right now? Chest pain, difficulty breathing, severe bleeding, or loss of consciousness? Please answer yes or no.',
    inputType: 'voice',
  },
  {
    stepName: 'complaint',
    question: "What is your main reason for visiting today? Please describe what you're experiencing.",
    inputType: 'voice',
  },
  {
    stepName: 'demographics',
    question: 'What is your first name, age, and sex? For example: "My name is Sarah, I am 32 years old, female."',
    inputType: 'voice',
  },
  {
    stepName: 'symptom_detail',
    question: 'On a scale of 1 to 10, how severe would you say your symptoms are right now? And how long have you had them?',
    inputType: 'voice',
  },
  {
    stepName: 'associated_symptoms',
    question: 'Are you experiencing any other symptoms — such as fever, difficulty breathing, chest tightness, dizziness, or nausea?',
    inputType: 'voice',
  },
  {
    stepName: 'medical_history',
    question: 'Do you have any known medical conditions like diabetes, heart disease, or high blood pressure? Are you on any blood thinners or regular medications?',
    inputType: 'voice',
  },
  {
    stepName: 'vitals',
    question: 'Excellent! Finally, I\'d like to take a few quick measurements — blood pressure, temperature, and oxygen level. These help me give you the most accurate assessment. Please tap Ready when you\'re comfortable.',
    inputType: 'vitals',
  },
];

const INTRO_SCRIPT =
  "Hello! I'm Nurse AI, your virtual triage assistant at SmartCare. " +
  "I'm here to ask you a few quick questions about how you're feeling today, " +
  "so we can make sure you get the right care as quickly as possible. " +
  "Please speak your answers clearly, and take your time — there's no rush. " +
  "Let's get started.";

// ─── Browser Speech-to-Text (Web Speech API) ───────────────────────────────────
// Replaces Deepgram — zero cost, no API key, built-in endpointing. Chrome/Edge
// expose it as webkitSpeechRecognition. continuous=false auto-finalizes on a
// pause and fires onend, which we use to auto-submit the captured answer.

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
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

function Waveform({ active, containerRef }: { active: boolean; containerRef?: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={containerRef} className="flex items-end justify-center gap-[3px]" style={{ height: 32 }}>
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          data-wv={i}
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

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('avatar_speaking');
  const [videoState, setVideoState] = useState<AvatarVisualState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState('');
  const [fallbackText, setFallbackText] = useState('');
  const [showFallback, setShowFallback] = useState(false);
  const [subtitle, setSubtitle] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const teardownRef = useRef(false); // true on unmount → onend must not auto-submit
  const waveformRef = useRef<HTMLDivElement>(null);
  const pendingLLMSpeechRef = useRef<string | null>(null);
  // Latest final transcript, readable synchronously when speech-end fires
  // (state lags) so we can auto-submit without a manual confirm tap.
  const transcriptRef = useRef('');
  const interimRef = useRef(''); // last interim — fallback when onend fires before a final result
  // Live providers render their remote stream into this single <video>.
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  // Idle watchdog: tears down the billed stream after inactivity (cost guard).
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vitals measurement state
  const [vitalsReady, setVitalsReady] = useState(false);
  const [vitalsBp, setVitalsBp] = useState<string | null>(null);
  const [vitalsTemp, setVitalsTemp] = useState<string | null>(null);
  const [vitalsSpo2, setVitalsSpo2] = useState<string | null>(null);
  const [vitalsMeasuring, setVitalsMeasuring] = useState<'bp' | 'temp' | 'spo2' | null>(null);

  const step = STEPS[stepIndex];
  const isSpeaking = phase === 'avatar_speaking';

  // ── Init manager + intro on mount ──
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    (async () => {
      // Build the provider-appropriate manager. For live providers the stream
      // is NOT opened here — it opens lazily on the first speak() below, so
      // nothing bills while the consent/intro UI is loading.
      const mgr = await createAvatarManager(AVATAR_PROVIDER, {
        sessionId,
        avatarType: 'nurse',
        getVideoElement: () => liveVideoRef.current,
        onStateChange: (s) => { if (!cancelled) setVideoState(s); },
        onWaveform: (data) => {
          const div = waveformRef.current;
          if (!div) return;
          const bars = div.querySelectorAll<HTMLElement>('[data-wv]');
          const stride = Math.floor(data.length / bars.length);
          bars.forEach((bar, i) => {
            const db = data[i * stride] ?? -100;
            const norm = Math.max(0, Math.min(1, (db + 70) / 70));
            bar.style.height = `${4 + norm * 24}px`;
            bar.style.animationName = 'none';
          });
        },
        onSubtitle: (text) => { if (!cancelled) setSubtitle(text); },
        onError: () => { if (!cancelled) setError('Avatar connection issue — you can use keyboard input below.'); },
      });
      if (cancelled) { await mgr.destroy(); return; }

      await mgr.speak(INTRO_SCRIPT);
      if (cancelled) return;
      await mgr.speak(STEPS[0].question);
      if (cancelled) return;
      // Conversational: auto-open the mic ONLY for voice steps (not vitals/tap).
      if (STEPS[0].inputType === 'voice') {
        await new Promise((r) => setTimeout(r, POST_SPEECH_ECHO_GUARD_MS));
        if (!cancelled) startListening();
      } else {
        setPhase('tap_choice');
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
      teardownRef.current = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      getActiveAvatarManager()?.destroy().catch(() => {});
      try { recognitionRef.current?.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Idle watchdog (live providers only) — stop billing while the patient
  //    isn't being spoken to. Reopens transparently on the next speak(). ──
  function armIdleClose() {
    if (!IS_LIVE_AVATAR) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      getActiveAvatarManager()?.closeStream().catch(() => {});
    }, LIVE_IDLE_CLOSE_MS);
  }
  function cancelIdleClose() {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
  }

  // ── Beacon close on exit — tears down a live (AKOOL) session if the patient
  //    closes the tab mid-flow, so idle minutes don't bleed. ──
  useEffect(() => {
    if (!IS_LIVE_AVATAR) return;
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      const payload = getActiveAvatarManager()?.beaconClosePayload();
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
  }, []);

  // ── Idle watchdog driver: arm while waiting on the patient, cancel while the
  //    avatar is busy. Closes the billed stream after LIVE_IDLE_CLOSE_MS idle. ──
  useEffect(() => {
    if (!IS_LIVE_AVATAR) return;
    // 'listening' = mic open, patient actively engaged → keep the stream alive
    // (closing it makes the avatar vanish mid-interaction). Only arm idle-close
    // on the passive 'confirming'/'tap_choice' waits.
    if (
      phase === 'avatar_speaking' ||
      phase === 'processing' ||
      phase === 'thinking' ||
      phase === 'listening'
    ) {
      cancelIdleClose();
    } else {
      armIdleClose();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Step 1+ question ──
  useEffect(() => {
    if (stepIndex === 0) return;
    let cancelled = false;
    setPhase('avatar_speaking');
    setTranscript('');
    setInterimTranscript('');
    setError('');
    setSubtitle('');

    const speechText = pendingLLMSpeechRef.current || STEPS[stepIndex].question;
    pendingLLMSpeechRef.current = null;

    (async () => {
      const mgr = getActiveAvatarManager();
      if (!mgr) return;
      await mgr.speak(speechText);
      if (cancelled) return;
      // Conversational: auto-open the mic ONLY for voice steps (not vitals/tap).
      if (STEPS[stepIndex].inputType === 'voice') {
        await new Promise((r) => setTimeout(r, POST_SPEECH_ECHO_GUARD_MS));
        if (!cancelled) startListening();
      } else {
        setPhase('tap_choice');
      }
    })().catch(() => {});

    return () => { cancelled = true; };
  }, [stepIndex]);

  // ── Mic (Web Speech API) ──
  function startListening() {
    setTranscript('');
    transcriptRef.current = '';
    interimRef.current = '';
    setInterimTranscript('');
    setError('');
    setPhase('listening');
    getActiveAvatarManager()?.showListening();

    const SR = getSpeechRecognitionCtor();
    if (!SR) {
      setError('Voice input is not supported in this browser. Please use keyboard input below.');
      setShowFallback(true);
      getActiveAvatarManager()?.showIdle();
      setPhase('confirming');
      return;
    }

    try {
      const rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.continuous = false; // auto-finalizes on a pause → onend → auto-submit
      rec.maxAlternatives = 1;
      let errored = false;
      console.log('[STT] starting recognition');

      rec.onresult = (e) => {
        console.log('[STT] result', e.results?.length);
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const text = r[0]?.transcript ?? '';
          if (r.isFinal) {
            const t = text.trim();
            if (t) {
              cancelIdleClose();
              setTranscript((prev) => {
                const v = (prev + ' ' + t).trim();
                transcriptRef.current = v;
                return v;
              });
            }
          } else {
            interim += text;
          }
        }
        if (interim) { cancelIdleClose(); interimRef.current = interim; setInterimTranscript(interim); }
      };

      rec.onerror = (e) => {
        errored = true;
        const err = e?.error;
        console.warn('[STT] error', err);
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setError('Microphone access denied. Please allow microphone permission and try again, or use keyboard input below.');
          setShowFallback(true);
        } else if (err !== 'no-speech' && err !== 'aborted') {
          setError('Voice input error. Please use keyboard input below.');
          setShowFallback(true);
        }
        getActiveAvatarManager()?.showIdle();
        setInterimTranscript('');
        setPhase('confirming');
      };

      rec.onend = () => {
        console.log('[STT] ended; heard=', JSON.stringify(transcriptRef.current));
        recognitionRef.current = null;
        if (teardownRef.current || errored) return;
        // Speech ended (endpointing). Conversational: auto-submit what we heard
        // — no manual confirm tap. Empty capture falls back to confirm/keyboard.
        getActiveAvatarManager()?.showIdle();
        setInterimTranscript('');
        // Prefer a finalized transcript; if Chrome ended before emitting a
        // final (common on Linux), fall back to the last interim so heard
        // words aren't lost.
        const heard = (transcriptRef.current.trim() || interimRef.current.trim());
        if (heard) {
          setTranscript(heard);
          transcriptRef.current = heard;
          submitAnswer(heard);
        } else {
          // Nothing captured — surface the keyboard so the patient is never
          // stuck on a phase with no actionable buttons.
          setPhase('confirming');
          setShowFallback(true);
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setError('Could not start voice input. Please use keyboard input below.');
      setShowFallback(true);
      getActiveAvatarManager()?.showIdle();
      setPhase('confirming');
    }
  }

  function stopListening() {
    // stop() finalizes and fires onend → auto-submit of what was heard.
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
  }

  // ── Vitals measurement sequence ──
  async function handleVitalsMeasure() {
    setVitalsReady(true);
    // Measurements run ~30-90s with the avatar silent — close the billed
    // stream so idle minutes don't accrue. It reopens on the next speak().
    if (IS_LIVE_AVATAR) await getActiveAvatarManager()?.closeStream().catch(() => {});
    try {
      setVitalsMeasuring('bp');
      const bp = await api.triggerMeasurement(sessionId, 'BLOOD_PRESSURE');
      const bpData = bp.data as unknown as Record<string, number>;
      setVitalsBp(`${bpData.systolic ?? '—'}/${bpData.diastolic ?? '—'}`);

      setVitalsMeasuring('temp');
      const temp = await api.triggerMeasurement(sessionId, 'TEMPERATURE');
      const tempData = temp.data as unknown as Record<string, number>;
      setVitalsTemp(`${tempData.temperature ?? '—'}°C`);

      setVitalsMeasuring('spo2');
      const spo2 = await api.triggerMeasurement(sessionId, 'OXIMETER');
      const spo2Data = spo2.data as unknown as Record<string, number>;
      setVitalsSpo2(`${spo2Data.spo2 ?? '—'}%`);
    } catch { /* show what we have, continue */ }
    setVitalsMeasuring(null);
  }

  async function handleVitalsDone() {
    setPhase('processing');
    router.push(`/booth/${sessionId}/results`);
  }

  // ── Submit ──
  async function submitAnswer(answer: string) {
    if (!answer.trim()) { setError('Please provide an answer before continuing.'); return; }
    setPhase('processing');
    setError('');
    try {
      const res = await api.submitAnswer(sessionId, step.stepName, answer.trim());
      const { next_step, avatar_speech_text } = res.data;
      // Trust the backend's routing decision (it owns the state machine + red-flag engine).
      if (next_step === 'emergency') {
        router.push(`/booth/${sessionId}/emergency`);
        return;
      }
      if (next_step === 'results' || stepIndex >= STEPS.length - 1) {
        if (avatar_speech_text) await getActiveAvatarManager()?.speak(avatar_speech_text);
        router.push(`/booth/${sessionId}/results`);
        return;
      }
      // Always lead the next step with the LLM-generated speech (the ack + lead-in
      // belongs at the START of the next step, not after a vitals measurement).
      if (avatar_speech_text) {
        pendingLLMSpeechRef.current = avatar_speech_text;
      }
      // Thinking state before advancing to next question
      setPhase('thinking');
      await new Promise(r => setTimeout(r, 1400));
      setStepIndex((i) => i + 1);
    } catch {
      setError('Something went wrong. Please try again.');
      setPhase(step.inputType === 'tap' ? 'tap_choice' : 'listening');
    }
  }

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
        @keyframes video-glow {
          0%,100% { box-shadow: 0 0 30px 6px rgba(9,246,238,0.12), 0 0 60px 12px rgba(9,246,238,0.06); }
          50%      { box-shadow: 0 0 40px 10px rgba(9,246,238,0.22), 0 0 80px 20px rgba(9,246,238,0.1); }
        }
        @keyframes think-dot {
          0%,80%,100% { transform:scale(0.6); opacity:0.4; }
          40%          { transform:scale(1.1); opacity:1; }
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

          <StepDots total={STEPS.length} current={stepIndex} />

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

            {/* Video card — tap to interrupt while speaking */}
            <div
              onClick={() => {
                if (phase === 'avatar_speaking') {
                  getActiveAvatarManager()?.interrupt();
                  setSubtitle('');
                  setPhase('listening');
                }
              }}
              style={{
                width: 'min(380px, 90vw)',
                height: 'min(460px, 52vw)',
                minHeight: 260,
                borderRadius: 28,
                overflow: 'hidden',
                border: '2px solid rgba(9,246,238,0.35)',
                background: 'var(--color-dash-card)',
                position: 'relative',
                animation: 'video-glow 3s ease-in-out infinite',
                cursor: phase === 'avatar_speaking' ? 'pointer' : 'default',
              }}>

              {IS_LIVE_AVATAR ? (
                /* Live provider (AKOOL/HeyGen): single remote stream element */
                <video
                  ref={liveVideoRef}
                  autoPlay playsInline
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    position: 'absolute', inset: 0,
                  }}
                />
              ) : (
                /* Video-loop provider: crossfade pre-recorded mp4s by state */
                <>
                  <video
                    src="/avatar/idle.mp4"
                    autoPlay loop muted playsInline
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      position: 'absolute', inset: 0,
                      opacity: videoState === 'idle' ? 1 : 0,
                      transition: 'opacity 0.15s ease',
                    }}
                  />
                  <video
                    src="/avatar/speaking.mp4"
                    autoPlay loop muted playsInline
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      position: 'absolute', inset: 0,
                      opacity: videoState === 'speaking' ? 1 : 0,
                      transition: 'opacity 0.15s ease',
                    }}
                  />
                  <video
                    src="/avatar/listening.mp4"
                    autoPlay loop muted playsInline
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      position: 'absolute', inset: 0,
                      opacity: videoState === 'listening' ? 1 : 0,
                      transition: 'opacity 0.15s ease',
                    }}
                  />
                </>
              )}

              {/* Live badge */}
              <div style={{
                position: 'absolute', top: 12, right: 12,
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
                  background: '#09f6ee',
                  animation: 'status-dot 1.5s ease-in-out infinite',
                  display: 'block',
                }} />
                <span style={{ color: '#09f6ee', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Live
                </span>
              </div>

              {/* Tap-to-interrupt hint */}
              {phase === 'avatar_speaking' && (
                <div style={{
                  position: 'absolute', top: 12, left: 12,
                  background: 'rgba(5,20,20,0.65)',
                  border: '1px solid rgba(9,246,238,0.2)',
                  borderRadius: 12,
                  padding: '3px 9px',
                  backdropFilter: 'blur(6px)',
                  zIndex: 2,
                }}>
                  <span style={{ color: 'rgba(9,246,238,0.55)', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Tap to interrupt
                  </span>
                </div>
              )}

              {/* Live subtitles */}
              {subtitle && phase === 'avatar_speaking' && (
                <div style={{
                  position: 'absolute', bottom: 12, left: 12, right: 12,
                  background: 'rgba(5,20,20,0.82)',
                  border: '1px solid rgba(9,246,238,0.15)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  backdropFilter: 'blur(8px)',
                  zIndex: 2,
                }}>
                  <p style={{ color: '#e0fffe', fontSize: 11, lineHeight: 1.4, margin: 0, textAlign: 'center' }}>
                    {subtitle}
                  </p>
                </div>
              )}

              {/* Gradient overlay bottom */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
                background: 'linear-gradient(to top, rgba(5,20,20,0.7) 0%, transparent 100%)',
                pointerEvents: 'none',
                zIndex: 1,
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
                      : phase === 'thinking'
                        ? 'Thinking…'
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
                <p style={{ color: '#e0fffe', fontSize: 15, lineHeight: 1.65, fontWeight: 500 }}>
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
                    style={{
                      background: opt.danger ? 'rgba(220,38,38,0.08)' : 'rgba(34,197,94,0.07)',
                      border: `1.5px solid ${opt.danger ? 'rgba(220,38,38,0.4)' : 'rgba(34,197,94,0.35)'}`,
                      borderRadius: 14,
                      padding: '18px 24px',
                      color: opt.danger ? '#fca5a5' : '#86efac',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      textAlign: 'center',
                      width: '100%',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {/* ── Voice input ── */}
            {step?.inputType === 'voice' && (
              <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>

                {(phase === 'listening' || phase === 'confirming' || phase === 'avatar_speaking') && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
                    <button
                      onClick={phase === 'listening' ? stopListening : startListening}
                      className={phase === 'listening' ? 'mic-live' : ''}
                      style={{
                        width: 88, height: 88, borderRadius: '50%',
                        border: `2.5px solid ${phase === 'listening' ? '#09f6ee' : 'rgba(9,246,238,0.25)'}`,
                        background: phase === 'listening'
                          ? 'radial-gradient(circle, rgba(9,246,238,0.18) 0%, rgba(54,201,197,0.08) 100%)'
                          : 'rgba(9,246,238,0.04)',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s',
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

                    <Waveform active={phase === 'listening'} containerRef={waveformRef} />

                    <p style={{
                      color: phase === 'listening' ? '#09f6ee' : 'rgba(9,246,238,0.45)',
                      fontSize: 11, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.1em',
                    }}>
                      {phase === 'listening' ? 'Listening — tap to stop' : 'Tap to speak'}
                    </p>
                  </div>
                )}

                {/* Transcript */}
                {(transcript || interimTranscript) && (
                  <div style={{
                    width: '100%',
                    background: 'rgba(9,246,238,0.03)',
                    border: '1px solid rgba(9,246,238,0.12)',
                    borderRadius: 12, padding: '12px 16px', minHeight: 50,
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
                        border: 'none', borderRadius: 12, padding: '14px 0',
                        color: '#051414', fontSize: 14, fontWeight: 800, cursor: 'pointer',
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
                        borderRadius: 12, padding: '14px 0',
                        color: '#09f6ee', fontSize: 14, fontWeight: 600, cursor: 'pointer',
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
                    Use keyboard instead
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
                        borderRadius: 12, padding: '12px 16px',
                        color: '#f0fffe', fontSize: 14,
                        outline: 'none', resize: 'none', fontFamily: 'inherit',
                      }}
                    />
                    <button
                      onClick={() => submitAnswer(fallbackText)}
                      disabled={!fallbackText.trim()}
                      style={{
                        background: fallbackText.trim()
                          ? 'linear-gradient(135deg, #36c9c5, #09f6ee)'
                          : 'rgba(9,246,238,0.08)',
                        border: 'none', borderRadius: 12, padding: '13px 0',
                        color: fallbackText.trim() ? '#051414' : 'rgba(9,246,238,0.3)',
                        fontSize: 14, fontWeight: 800,
                        cursor: fallbackText.trim() ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Submit Answer
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Vitals step ── */}
            {step?.inputType === 'vitals' && phase !== 'processing' && (
              <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Device rows */}
                {[
                  { key: 'bp' as const, label: 'Blood Pressure', unit: 'mmHg', value: vitalsBp, icon: '🫀' },
                  { key: 'temp' as const, label: 'Temperature', unit: '°C', value: vitalsTemp, icon: '🌡️' },
                  { key: 'spo2' as const, label: 'Oxygen Saturation', unit: '%', value: vitalsSpo2, icon: '💧' },
                ].map(({ key, label, unit, value, icon }) => (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--color-dash-card)',
                    border: `1px solid ${vitalsMeasuring === key ? 'rgba(9,246,238,0.5)' : value ? 'rgba(54,201,197,0.3)' : 'rgba(9,246,238,0.12)'}`,
                    borderRadius: 14, padding: '14px 18px',
                    transition: 'border-color 0.3s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{icon}</span>
                      <div>
                        <p style={{ color: '#e0fffe', fontSize: 13, fontWeight: 600, margin: 0 }}>{label}</p>
                        <p style={{ color: 'rgba(9,246,238,0.4)', fontSize: 10, fontFamily: 'monospace', margin: 0 }}>{unit}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {vitalsMeasuring === key ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#09f6ee', animation: 'status-dot 0.8s ease-in-out infinite' }} />
                          <span style={{ color: '#09f6ee', fontSize: 11, fontWeight: 700 }}>Measuring…</span>
                        </div>
                      ) : value ? (
                        <span style={{ color: '#36c9c5', fontSize: 16, fontWeight: 900, fontFamily: 'monospace' }}>{value}</span>
                      ) : (
                        <span style={{ color: 'rgba(9,246,238,0.25)', fontSize: 11 }}>Pending</span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Action button */}
                {!vitalsReady ? (
                  <button
                    onClick={handleVitalsMeasure}
                    style={{
                      background: 'linear-gradient(135deg, #36c9c5, #09f6ee)',
                      border: 'none', borderRadius: 14, padding: '16px 0',
                      color: '#051414', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                    }}
                  >
                    ▶ Start Measurements
                  </button>
                ) : vitalsMeasuring === null && (vitalsBp || vitalsTemp || vitalsSpo2) ? (
                  <button
                    onClick={handleVitalsDone}
                    style={{
                      background: 'linear-gradient(135deg, #36c9c5, #09f6ee)',
                      border: 'none', borderRadius: 14, padding: '16px 0',
                      color: '#051414', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                    }}
                  >
                    ✓ View My Results →
                  </button>
                ) : null}
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

            {/* Thinking state (3-dot pulse) */}
            {phase === 'thinking' && (
              <div className="fade-up" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '14px 0' }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#09f6ee',
                    animation: `think-dot 1.2s ease-in-out ${i * 0.18}s infinite`,
                  }} />
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                background: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.3)',
                borderRadius: 10, padding: '10px 14px',
                color: '#fca5a5', fontSize: 13,
              }}>
                {error}
              </div>
            )}
          </div>
        </div>

        <div style={{ height: 12, flexShrink: 0 }} />
      </div>
    </>
  );
}
