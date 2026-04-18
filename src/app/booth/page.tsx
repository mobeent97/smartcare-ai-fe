'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AKOOLAvatarManager } from '@/lib/akool';
import { useBoothStore } from '@/store/booth';
import { BoothLayout } from '@/components/common/BoothLayout';
import { AvatarPanel } from '@/components/booth/AvatarPanel';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export default function WelcomePage() {
  const router = useRouter();
  const { setSessionId, setAkoolSessionId, setAvatarStatus, avatarStatus, setAvatarSpeechText, avatarSpeechText } = useBoothStore();
  const [sessionId, setLocalSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const avatarStarted = useRef(false);

  // Step 1: create triage session on mount
  useEffect(() => {
    api.createTriageSession()
      .then((res) => {
        const sid = res.data.id;
        setSessionId(sid);
        setLocalSessionId(sid);
        setAvatarSpeechText("Hello! I'm your AI triage nurse. I'll guide you through a quick health assessment. Please read and accept the consent below to begin.");
      })
      .catch(() => setSessionError(true));
  }, [setSessionId, setAvatarSpeechText]);

  // Step 2: once session AND video element are ready, init avatar
  const handleVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    if (!el || !sessionId || avatarStarted.current) return;
    avatarStarted.current = true;

    const manager = new AKOOLAvatarManager({
      sessionId,
      avatarType: 'nurse',
      videoElement: el,
      onConnectionChange: (state) => setAvatarStatus(
        state === 'connected' ? 'live' : state === 'connecting' ? 'connecting' : 'idle'
      ),
      onError: () => setAvatarStatus('idle'),
    });

    manager.initialize()
      .then(({ akoolSessionId }) => setAkoolSessionId(akoolSessionId))
      .catch(() => {});
  }, [sessionId, setAkoolSessionId, setAvatarStatus]);

  // If sessionId arrives after videoEl is already mounted, kick off avatar then
  useEffect(() => {
    if (!sessionId || !videoElRef.current || avatarStarted.current) return;
    avatarStarted.current = true;

    const manager = new AKOOLAvatarManager({
      sessionId,
      avatarType: 'nurse',
      videoElement: videoElRef.current,
      onConnectionChange: (state) => setAvatarStatus(
        state === 'connected' ? 'live' : state === 'connecting' ? 'connecting' : 'idle'
      ),
      onError: () => setAvatarStatus('idle'),
    });

    manager.initialize()
      .then(({ akoolSessionId }) => setAkoolSessionId(akoolSessionId))
      .catch(() => {});
  }, [sessionId, setAkoolSessionId, setAvatarStatus]);

  function handleConsent() {
    if (sessionId) router.push(`/booth/${sessionId}/check`);
  }

  return (
    <BoothLayout
      avatarPanel={
        <AvatarPanel
          avatarStatus={avatarStatus}
          avatarType="nurse"
          speechText={avatarSpeechText}
          onVideoRef={handleVideoRef}
        />
      }
    >
      {sessionError ? (
        <div className="text-center max-w-sm">
          <p style={{ color: '#dc2626', fontSize: 16 }}>Unable to start session. Please ask staff for assistance.</p>
        </div>
      ) : !sessionId ? (
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" />
          <p style={{ color: '#9ca3af' }}>Starting your session…</p>
        </div>
      ) : (
        <div className="w-full max-w-md flex flex-col gap-6">
          <div className="text-center">
            <h1 style={{ fontSize: 32, fontWeight: 800, color: '#36c9c5', letterSpacing: '-0.5px' }}>
              Smart Care AI
            </h1>
            <p style={{ color: '#9ca3af', marginTop: 4, fontSize: 15 }}>
              AI-Powered Emergency Triage
            </p>
          </div>

          <div className="flex gap-3 justify-center flex-wrap">
            {[
              { icon: '🤖', label: 'AI-Powered' },
              { icon: '🔒', label: 'HIPAA Secure' },
              { icon: '👨‍⚕️', label: 'Clinician Reviewed' },
            ].map(({ icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
                style={{ backgroundColor: '#1f2937', border: '1px solid #374151', color: '#d1d5db' }}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: '#111827', border: '1px solid #374151' }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f9fafb', marginBottom: 10 }}>
              Consent &amp; Privacy
            </h2>
            <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6 }}>
              By proceeding, you consent to this AI-assisted triage assessment. Your responses
              will be reviewed by a licensed clinician. No personal health information is stored
              beyond this session without your explicit permission.
            </p>
          </div>

          <button
            onClick={handleConsent}
            className="w-full rounded-2xl font-bold text-lg transition-all active:scale-95"
            style={{
              backgroundColor: '#36c9c5',
              color: '#0a0f1e',
              padding: '18px 0',
              fontSize: 18,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              minHeight: 64,
            }}
          >
            I Consent &amp; Begin →
          </button>
        </div>
      )}
    </BoothLayout>
  );
}
