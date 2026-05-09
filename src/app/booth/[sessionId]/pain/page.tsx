'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useBoothStore } from '@/store/booth';
import { BoothLayout } from '@/components/common/BoothLayout';
import { AvatarPanel } from '@/components/booth/AvatarPanel';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmergencyFab } from '@/components/booth/EmergencyFab';

// Color gradient from green (1) to red (10)
const PAIN_COLORS = [
  '#22c55e', '#4ade80', '#a3e635', '#facc15',
  '#fb923c', '#f97316', '#ef4444', '#dc2626', '#b91c1c', '#991b1b',
];

export default function PainPage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { avatarStatus, setAvatarSpeechText } = useBoothStore();
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    if (selected === null) return;
    setLoading(true);
    try {
      const res = await api.submitAnswer(sessionId, 'symptom_detail', String(selected));
      setAvatarSpeechText(res.data.avatar_speech_text);
      router.push(`/booth/${sessionId}/vitals`);
    } catch {
      setLoading(false);
    }
  }

  return (
    <BoothLayout
      avatarPanel={
        <AvatarPanel
          avatarStatus={avatarStatus}
          avatarType="nurse"
          speechText="On a scale of 1 to 10, how would you rate your pain or discomfort right now?"
        />
      }
    >
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="text-center">
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f9fafb' }}>
            Pain Level
          </h2>
          <p style={{ color: '#9ca3af', marginTop: 6, fontSize: 14 }}>
            Tap the number that best describes your pain.
          </p>
        </div>

        <div className="flex gap-2 justify-center flex-wrap">
          {PAIN_COLORS.map((color, i) => {
            const level = i + 1;
            const isSelected = selected === level;
            return (
              <button
                key={level}
                onClick={() => setSelected(level)}
                className="rounded-full font-bold transition-all"
                style={{
                  width: 64,
                  height: 64,
                  backgroundColor: isSelected ? color : 'transparent',
                  border: `3px solid ${color}`,
                  color: isSelected ? '#0a0f1e' : color,
                  fontSize: 18,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 700,
                  transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                  boxShadow: isSelected ? `0 0 16px ${color}80` : 'none',
                  outline: 'none',
                }}
              >
                {level}
              </button>
            );
          })}
        </div>

        {selected !== null && (
          <div className="text-center">
            <span style={{ color: PAIN_COLORS[selected - 1], fontSize: 15, fontWeight: 600 }}>
              {selected <= 3 ? 'Mild' : selected <= 6 ? 'Moderate' : 'Severe'} pain — level {selected}/10
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-4">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <button
            onClick={handleContinue}
            disabled={selected === null}
            className="w-full rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-40"
            style={{
              backgroundColor: '#36c9c5',
              color: '#0a0f1e',
              padding: '18px 0',
              fontSize: 18,
              fontWeight: 700,
              border: 'none',
              minHeight: 64,
            }}
          >
            Next →
          </button>
        )}
      </div>
      <EmergencyFab sessionId={sessionId} />
    </BoothLayout>
  );
}
