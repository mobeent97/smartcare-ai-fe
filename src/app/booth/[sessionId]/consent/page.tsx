'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { prewarmMic, prefetchMint } from '@/lib/realtime-prewarm';
import { useBoothStore } from '@/store/booth';

// All audio prefetched in parallel while user reads consent
const AVATAR_INTRO =
  "Hello! I'm Nurse AI, your virtual triage assistant at SmartCare. " +
  "I'm here to ask you a few quick questions about how you're feeling today, " +
  "so we can make sure you get the right care as quickly as possible. " +
  "Please speak your answers clearly, and take your time — there's no rush. " +
  "Let's get started.";

const ALL_TTS_TEXTS = [
  AVATAR_INTRO,
  'Before we begin — are you experiencing a life-threatening emergency right now? Chest pain, difficulty breathing, severe bleeding, or loss of consciousness?',
  "What is your main reason for visiting today? Please describe what you're experiencing.",
  'What is your first name, age, and sex? For example: "My name is Sarah, I am 32 years old, female."',
  'On a scale of 1 to 10, how severe would you say your symptoms are right now? And how long have you had them?',
  'Are you experiencing any other symptoms — such as fever, difficulty breathing, chest tightness, dizziness, or nausea?',
  'Do you have any known medical conditions like diabetes, heart disease, or high blood pressure? Are you on any blood thinners or regular medications?',
  'Excellent! Finally, I\'d like to take a few quick measurements — blood pressure, temperature, and oxygen level. These help me give you the most accurate assessment. Please tap Ready when you\'re comfortable.',
];

const CONSENT_POINTS = [
  'Your responses will be used solely for this triage session.',
  'No personally identifiable information is stored beyond this session.',
  'This is an AI-assisted screening — not a medical diagnosis.',
  'A qualified healthcare professional will review your case.',
  'You may stop or request human assistance at any time.',
];

export default function ConsentPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumed = searchParams.get('resumed') === '1';
  const queryMode = searchParams.get('mode'); // 'avatar' | 'manual' | null
  const storeMode = useBoothStore((s) => s.mode);
  // URL beats store (in case patient hits link directly), store is the fallback
  // when the guard layout redirects here without a mode param.
  const mode = queryMode || storeMode || 'avatar';
  const [audioReady, setAudioReady] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // Get the microphone permission dialog out of the way while the patient is
  // reading, not while the nurse is trying to greet them. Sends nothing — the
  // grant just makes the later getUserMedia in connect() prompt-free.
  useEffect(() => {
    let alive = true;
    prewarmMic().finally(() => { if (alive) setAudioReady(true); });
    return () => { alive = false; };
  }, []);

  async function handleAgree() {
    setAgreed(true);
    // Await consent recording — the layout guard reads consent_given_at on the
    // next page; if we navigate before the backend persists it, the guard will
    // bounce the patient straight back here in a redirect loop.
    try {
      await api.recordConsent(sessionId);
    } catch {
      // Non-blocking: still navigate. Guard will retry or accept stale check.
    }
    if (mode === 'manual') {
      router.push(`/booth/${sessionId}/manual`);
      return;
    }
    // Start the ephemeral-key round trip now, so it overlaps the navigation and
    // the realtime page's first render instead of running after them. Only ever
    // after consent is recorded — minting builds instructions from the session.
    prefetchMint(sessionId);
    router.push(`/booth/${sessionId}/realtime`);
  }

  return (
    <>
      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-dot {
          0%,100% { opacity: 0.4; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.3); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .fade-up { animation: fade-up 0.5s ease both; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'var(--color-dash-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
      }}>

        {resumed && (
          <div className="fade-up" style={{
            width: '100%',
            maxWidth: 560,
            marginBottom: 14,
            padding: '12px 16px',
            background: 'rgba(234,179,8,0.08)',
            border: '1px solid rgba(234,179,8,0.4)',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>⏱</span>
            <p style={{ color: '#fde68a', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
              Your previous session timed out. Please reconfirm consent to continue.
            </p>
          </div>
        )}

        {/* Card */}
        <div className="fade-up" style={{
          width: '100%',
          maxWidth: 560,
          background: 'var(--color-dash-card)',
          border: '1px solid rgba(9,246,238,0.15)',
          borderRadius: 24,
          overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            padding: '28px 32px 24px',
            borderBottom: '1px solid rgba(9,246,238,0.08)',
            background: 'linear-gradient(135deg, rgba(9,246,238,0.04), transparent)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'rgba(9,246,238,0.08)',
                border: '1px solid rgba(9,246,238,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#09f6ee" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div>
                <p style={{ color: 'rgba(9,246,238,0.5)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Before we begin
                </p>
                <h1 style={{ color: '#e0fffe', fontSize: 20, fontWeight: 800, margin: 0 }}>
                  Patient Consent
                </h1>
              </div>
            </div>
            <p style={{ color: 'rgba(224,255,254,0.6)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              Please read and accept the following before starting your AI-assisted triage session with Nurse AI.
            </p>
          </div>

          {/* Consent points */}
          <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {CONSENT_POINTS.map((point, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                animationDelay: `${i * 0.06}s`,
              }} className="fade-up">
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                  background: 'rgba(9,246,238,0.08)',
                  border: '1px solid rgba(9,246,238,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#09f6ee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <p style={{ color: 'rgba(224,255,254,0.75)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                  {point}
                </p>
              </div>
            ))}
          </div>

          {/* Audio prep indicator */}
          <div style={{
            margin: '0 32px',
            padding: '10px 14px',
            borderRadius: 10,
            background: audioReady ? 'rgba(34,197,94,0.06)' : 'rgba(9,246,238,0.04)',
            border: `1px solid ${audioReady ? 'rgba(34,197,94,0.2)' : 'rgba(9,246,238,0.12)'}`,
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'all 0.4s',
          }}>
            {audioReady ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span style={{ color: '#86efac', fontSize: 11, fontWeight: 600 }}>
                  Microphone ready
                </span>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: '#09f6ee',
                      display: 'block',
                      animation: `pulse-dot 1s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
                <span style={{ color: 'rgba(9,246,238,0.5)', fontSize: 11, fontWeight: 600 }}>
                  Checking microphone…
                </span>
              </>
            )}
          </div>

          {/* Actions */}
          <div style={{ padding: '20px 32px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={handleAgree}
              disabled={agreed}
              style={{
                width: '100%',
                padding: '15px 0',
                borderRadius: 14,
                border: 'none',
                background: agreed
                  ? 'rgba(9,246,238,0.15)'
                  : 'linear-gradient(135deg, #36c9c5, #09f6ee)',
                color: agreed ? 'rgba(9,246,238,0.5)' : '#051414',
                fontSize: 15,
                fontWeight: 800,
                cursor: agreed ? 'not-allowed' : 'pointer',
                letterSpacing: '0.02em',
                transition: 'all 0.2s',
              }}
            >
              {agreed ? 'Starting session…' : 'I Agree & Start Session'}
            </button>
            <button
              onClick={() => router.back()}
              disabled={agreed}
              style={{
                width: '100%',
                padding: '12px 0',
                borderRadius: 14,
                border: '1px solid rgba(9,246,238,0.12)',
                background: 'transparent',
                color: 'rgba(9,246,238,0.4)',
                fontSize: 13,
                fontWeight: 600,
                cursor: agreed ? 'not-allowed' : 'pointer',
              }}
            >
              Go Back
            </button>
          </div>
        </div>

        {/* Footer note */}
        <p style={{ color: 'rgba(9,246,238,0.25)', fontSize: 11, marginTop: 20, textAlign: 'center', maxWidth: 400 }}>
          SmartCare AI is an AI-assisted triage tool. Always seek professional medical advice in emergencies.
        </p>
      </div>
    </>
  );
}
