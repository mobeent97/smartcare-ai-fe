'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AKOOLAvatarManager } from '@/lib/akool';
import { useBoothStore } from '@/store/booth';
import { BoothLayout } from '@/components/common/BoothLayout';
import { AvatarPanel } from '@/components/booth/AvatarPanel';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export default function WelcomePage() {
  const router = useRouter();
  const { setSessionId, setAkoolSessionId, setAvatarConnected, isAvatarConnected, setAvatarSpeechText, avatarSpeechText } = useBoothStore();
  const [loading, setLoading] = useState(true);
  const [sessionId, setLocalSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const sessionRes = await api.createTriageSession();
        const sid = sessionRes.data.id;
        setSessionId(sid);
        setLocalSessionId(sid);

        const manager = new AKOOLAvatarManager({
          sessionId: sid,
          avatarType: 'nurse',
          onReady: () => {
            setAvatarConnected(true);
            setAvatarSpeechText("Hello! I'm your AI triage nurse. I'll guide you through a quick health assessment. Please read and accept the consent below to begin.");
          },
          onError: () => {
            setAvatarConnected(false);
            setAvatarSpeechText("Hello! I'm your AI triage nurse. Please accept the consent below to begin.");
          },
        });

        const { akoolSessionId } = await manager.initialize();
        setAkoolSessionId(akoolSessionId);
      } catch {
        setError('Unable to start session. Please ask staff for assistance.');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [setSessionId, setAkoolSessionId, setAvatarConnected, setAvatarSpeechText]);

  function handleConsent() {
    if (sessionId) router.push(`/booth/${sessionId}/check`);
  }

  return (
    <BoothLayout
      avatarPanel={
        <AvatarPanel
          isLive={isAvatarConnected}
          avatarType="nurse"
          speechText={avatarSpeechText}
        />
      }
    >
      {loading ? (
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" />
          <p style={{ color: '#9ca3af' }}>Starting your session…</p>
        </div>
      ) : error ? (
        <div className="text-center max-w-sm">
          <p style={{ color: '#dc2626', fontSize: 16 }}>{error}</p>
        </div>
      ) : (
        <div className="w-full max-w-md flex flex-col gap-6">
          {/* Logo / Title */}
          <div className="text-center">
            <h1 style={{ fontSize: 32, fontWeight: 800, color: '#36c9c5', letterSpacing: '-0.5px' }}>
              Smart Care AI
            </h1>
            <p style={{ color: '#9ca3af', marginTop: 4, fontSize: 15 }}>
              AI-Powered Emergency Triage
            </p>
          </div>

          {/* Feature badges */}
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

          {/* Consent card */}
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: '#111827', border: '1px solid #374151' }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f9fafb', marginBottom: 10 }}>
              Consent & Privacy
            </h2>
            <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6 }}>
              By proceeding, you consent to this AI-assisted triage assessment. Your responses
              will be reviewed by a licensed clinician. No personal health information is stored
              beyond this session without your explicit permission.
            </p>
          </div>

          {/* CTA button */}
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
