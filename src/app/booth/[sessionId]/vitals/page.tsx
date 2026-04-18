'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { BoothWebSocket } from '@/lib/websocket';
import { useBoothStore } from '@/store/booth';
import { BoothLayout } from '@/components/common/BoothLayout';
import { AvatarPanel } from '@/components/booth/AvatarPanel';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import type { DeviceMeasurement } from '@/types/api';

const STEPS = [
  { icon: '🪑', label: 'Sit comfortably with your back straight' },
  { icon: '💪', label: 'Place your arm on the armrest, palm up' },
  { icon: '⏳', label: 'Stay still — measurement takes ~10 seconds' },
];

export default function VitalsMeasuringPage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { avatarStatus, setMeasurementResult } = useBoothStore();
  const [measuring, setMeasuring] = useState(true);
  const [statusText, setStatusText] = useState('Connecting to device…');

  useEffect(() => {
    const ws = new BoothWebSocket(
      sessionId,
      (data) => {
        setMeasurementResult(data as unknown as DeviceMeasurement);
        router.push(`/booth/${sessionId}/vitals/results`);
      },
      (status) => setStatusText(status || 'Measuring…')
    );
    ws.connect();

    async function trigger() {
      try {
        setStatusText('Device connected. Measuring blood pressure…');
        const res = await api.triggerMeasurement(sessionId, 'BLOOD_PRESSURE');
        setMeasurementResult(res.data);
        setMeasuring(false);
        router.push(`/booth/${sessionId}/vitals/results`);
      } catch {
        setStatusText('Measurement failed. Please ask staff for assistance.');
        setMeasuring(false);
      }
    }
    trigger();

    return () => ws.disconnect();
  }, [sessionId, setMeasurementResult, router]);

  return (
    <BoothLayout
      avatarPanel={
        <AvatarPanel
          avatarStatus={avatarStatus}
          avatarType="nurse"
          speechText="I'll now measure your blood pressure. Please follow the steps on screen and stay still."
        />
      }
    >
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="text-center">
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f9fafb' }}>
            Blood Pressure Check
          </h2>
          <p style={{ color: '#9ca3af', marginTop: 6, fontSize: 14 }}>
            Follow these steps for an accurate reading.
          </p>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl p-4"
              style={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
            >
              <span style={{ fontSize: 28 }}>{step.icon}</span>
              <div>
                <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600 }}>
                  STEP {i + 1}
                </span>
                <p style={{ color: '#f9fafb', fontSize: 14, marginTop: 2 }}>{step.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Progress indicator */}
        <div className="flex flex-col items-center gap-3">
          {measuring && <LoadingSpinner size="lg" />}
          <p style={{ color: '#36c9c5', fontSize: 14, textAlign: 'center' }}>{statusText}</p>
        </div>
      </div>
    </BoothLayout>
  );
}
