'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useBoothStore } from '@/store/booth';
import { BoothLayout } from '@/components/common/BoothLayout';
import { AvatarPanel } from '@/components/booth/AvatarPanel';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export default function CriticalCheckPage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { isAvatarConnected, setAvatarSpeechText } = useBoothStore();
  const [loading, setLoading] = useState(false);

  async function handleAnswer(answer: 'yes' | 'no') {
    setLoading(true);
    try {
      const res = await api.submitAnswer(sessionId, 'first_look', answer);
      const { next_step, avatar_speech_text } = res.data;
      setAvatarSpeechText(avatar_speech_text);

      if (next_step === 'emergency' || answer === 'yes') {
        router.push(`/booth/${sessionId}/emergency`);
      } else {
        router.push(`/booth/${sessionId}/complaint`);
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <BoothLayout
      avatarPanel={
        <AvatarPanel
          isLive={isAvatarConnected}
          avatarType="nurse"
          speechText="Are you experiencing any of the following right now? Chest pain, difficulty breathing, severe bleeding, or loss of consciousness?"
        />
      }
    >
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="text-center">
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f9fafb' }}>
            Critical Check
          </h2>
          <p style={{ color: '#9ca3af', marginTop: 8, fontSize: 15 }}>
            Are you experiencing a life-threatening emergency right now?
          </p>
        </div>

        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: '#1f2937', border: '1px solid rgba(220,38,38,0.3)' }}
        >
          <p style={{ color: '#fca5a5', fontSize: 13, textAlign: 'center' }}>
            Chest pain · Difficulty breathing · Severe bleeding · Unconsciousness
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <button
              onClick={() => handleAnswer('yes')}
              className="w-full rounded-2xl font-bold transition-all active:scale-95"
              style={{
                backgroundColor: '#dc2626',
                color: '#fff',
                padding: '22px 0',
                fontSize: 20,
                fontWeight: 700,
                border: 'none',
                minHeight: 80,
              }}
            >
              YES — I need emergency help
            </button>
            <button
              onClick={() => handleAnswer('no')}
              className="w-full rounded-2xl font-bold transition-all active:scale-95"
              style={{
                backgroundColor: '#16a34a',
                color: '#fff',
                padding: '22px 0',
                fontSize: 20,
                fontWeight: 700,
                border: 'none',
                minHeight: 80,
              }}
            >
              NO — Continue assessment
            </button>
          </div>
        )}
      </div>
    </BoothLayout>
  );
}
