'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useBoothStore } from '@/store/booth';
import { BoothLayout } from '@/components/common/BoothLayout';
import { AvatarPanel } from '@/components/booth/AvatarPanel';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmergencyFab } from '@/components/booth/EmergencyFab';

const QUICK_CHIPS = ['Chest Pain', 'Headache', 'Fever', 'Nausea', 'Injury', 'Difficulty Breathing'];

export default function ComplaintPage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { avatarStatus, setAvatarSpeechText } = useBoothStore();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  function addChip(chip: string) {
    setText((prev) => prev ? `${prev}, ${chip}` : chip);
  }

  async function handleContinue() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await api.submitAnswer(sessionId, 'complaint', text.trim());
      setAvatarSpeechText(res.data.avatar_speech_text);
      router.push(`/booth/${sessionId}/pain`);
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
          speechText="What brings you in today? Describe your main symptom or concern."
        />
      }
    >
      <div className="w-full max-w-md flex flex-col gap-5">
        <div className="text-center">
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f9fafb' }}>
            What&apos;s your concern?
          </h2>
          <p style={{ color: '#9ca3af', marginTop: 6, fontSize: 14 }}>
            Describe your main symptom in your own words.
          </p>
        </div>

        {/* Quick-select chips */}
        <div className="flex flex-wrap gap-2">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => addChip(chip)}
              className="rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-95"
              style={{
                backgroundColor: '#1f2937',
                border: '1px solid #36c9c5',
                color: '#36c9c5',
                minHeight: 40,
              }}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Text input */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. I have chest pain and difficulty breathing since this morning..."
          rows={4}
          className="w-full rounded-xl p-4 resize-none text-base"
          style={{
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            color: '#f9fafb',
            outline: 'none',
            fontSize: 15,
          }}
        />

        {loading ? (
          <div className="flex justify-center py-4">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <button
            onClick={handleContinue}
            disabled={!text.trim()}
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
            Continue →
          </button>
        )}
      </div>
      <EmergencyFab sessionId={sessionId} />
    </BoothLayout>
  );
}
