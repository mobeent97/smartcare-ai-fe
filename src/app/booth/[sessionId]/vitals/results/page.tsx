'use client';

import { useRouter, useParams } from 'next/navigation';
import { useBoothStore } from '@/store/booth';
import { BoothLayout } from '@/components/common/BoothLayout';
import { AvatarPanel } from '@/components/booth/AvatarPanel';

const CLASSIFICATION_COLORS: Record<string, string> = {
  'Normal': '#16a34a',
  'Elevated': '#ca8a04',
  'Stage 1 Hypertension': '#ea580c',
  'Stage 2 Hypertension': '#dc2626',
};

export default function VitalsResultsPage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { measurementResult, isAvatarConnected } = useBoothStore();

  const readings = measurementResult?.raw_readings ?? {};
  const classification = measurementResult?.classification ?? '—';
  const badgeColor = CLASSIFICATION_COLORS[classification] ?? '#9ca3af';

  return (
    <BoothLayout
      avatarPanel={
        <AvatarPanel
          isLive={isAvatarConnected}
          avatarType="nurse"
          speechText={`Your blood pressure reading is complete. Classification: ${classification}. We'll factor this into your assessment.`}
        />
      }
    >
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="text-center">
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f9fafb' }}>
            Your Reading
          </h2>
        </div>

        {/* BP Display */}
        <div
          className="rounded-2xl p-6 text-center"
          style={{ backgroundColor: '#111827', border: '1px solid #374151' }}
        >
          <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>BLOOD PRESSURE</p>
          <div className="flex items-baseline justify-center gap-2">
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 56, fontWeight: 700, color: '#f9fafb', lineHeight: 1 }}>
              {readings.systolic ?? '—'}
            </span>
            <span style={{ color: '#9ca3af', fontSize: 24 }}>/</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 56, fontWeight: 700, color: '#f9fafb', lineHeight: 1 }}>
              {readings.diastolic ?? '—'}
            </span>
          </div>
          <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>mmHg</p>

          <div className="mt-4">
            <span
              style={{
                backgroundColor: badgeColor,
                color: '#fff',
                padding: '4px 16px',
                borderRadius: 9999,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {classification}
            </span>
          </div>
        </div>

        <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
          Reference: Normal &lt;120/80 mmHg
        </p>

        <button
          onClick={() => router.push(`/booth/${sessionId}/results`)}
          className="w-full rounded-2xl font-bold transition-all active:scale-95"
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
          Continue to Results →
        </button>
      </div>
    </BoothLayout>
  );
}
