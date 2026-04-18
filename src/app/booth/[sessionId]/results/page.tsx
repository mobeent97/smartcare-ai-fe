'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { AKOOLAvatarManager } from '@/lib/akool';
import { useBoothStore } from '@/store/booth';
import { BoothLayout } from '@/components/common/BoothLayout';
import { AvatarPanel } from '@/components/booth/AvatarPanel';
import { CTASBadge } from '@/components/dashboard/CTASBadge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import type { TriageSession } from '@/types/api';

export default function TriageResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { avatarStatus, setAkoolSessionId, measurementResult } = useBoothStore();
  const [session, setSession] = useState<TriageSession | null>(null);
  const [loading, setLoading] = useState(true);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const managerStarted = useRef(false);

  const handleVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
  }, []);

  useEffect(() => {
    api.getCaseDetail(sessionId)
      .then((res) => setSession(res.data))
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    if (managerStarted.current || !videoElRef.current) return;
    managerStarted.current = true;

    const manager = new AKOOLAvatarManager({
      sessionId,
      avatarType: 'doctor',
      videoElement: videoElRef.current,
    });
    manager.initialize().then(({ akoolSessionId }) => setAkoolSessionId(akoolSessionId)).catch(() => {});
  }, [sessionId, setAkoolSessionId]);

  const ctasLevel = session?.ctas_level;
  const queueNumber = sessionId.slice(-4).toUpperCase();
  const readings = measurementResult?.raw_readings ?? {};

  return (
    <BoothLayout
      avatarPanel={
        <AvatarPanel
          avatarStatus={avatarStatus}
          avatarType="doctor"
          speechText={
            ctasLevel
              ? `Your triage assessment is complete. You have been assigned CTAS level ${ctasLevel}. Please proceed to the routing area indicated below.`
              : 'Your assessment is complete. A clinician will review your case shortly.'
          }
          onVideoRef={handleVideoRef}
        />
      }
    >
      {loading ? (
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" />
          <p style={{ color: '#9ca3af' }}>Finalizing your assessment…</p>
        </div>
      ) : (
        <div className="w-full max-w-md flex flex-col gap-5">
          <div className="text-center">
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f9fafb', marginBottom: 12 }}>
              Triage Complete
            </h2>
            {ctasLevel && <CTASBadge level={ctasLevel} size="lg" />}
          </div>

          {/* Complaint summary */}
          {session?.red_flags && session.red_flags.length > 0 && (
            <div
              className="rounded-xl p-4"
              style={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
            >
              <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                NOTED CONCERNS
              </p>
              <div className="flex flex-wrap gap-2">
                {session.red_flags.map((flag) => (
                  <span
                    key={flag}
                    style={{
                      backgroundColor: 'rgba(220,38,38,0.15)',
                      border: '1px solid rgba(220,38,38,0.4)',
                      color: '#fca5a5',
                      padding: '3px 10px',
                      borderRadius: 9999,
                      fontSize: 12,
                    }}
                  >
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Vitals mini grid */}
          {(readings.systolic || readings.diastolic) && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Systolic', value: readings.systolic, unit: 'mmHg' },
                { label: 'Diastolic', value: readings.diastolic, unit: 'mmHg' },
              ].map(({ label, value, unit }) => (
                <div
                  key={label}
                  className="rounded-xl p-3 text-center"
                  style={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                >
                  <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600 }}>{label}</p>
                  <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, fontWeight: 700, color: '#36c9c5' }}>
                    {value ?? '—'}
                  </p>
                  <p style={{ color: '#6b7280', fontSize: 11 }}>{unit}</p>
                </div>
              ))}
            </div>
          )}

          {/* Routing & Queue number */}
          <div
            className="rounded-2xl p-5 text-center"
            style={{ backgroundColor: '#111827', border: '1px solid rgba(54,201,197,0.3)' }}
          >
            <p style={{ color: '#9ca3af', fontSize: 13 }}>Your Queue Number</p>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 40, fontWeight: 800, color: '#36c9c5' }}>
              #{queueNumber}
            </p>
            <p style={{ color: '#d1d5db', fontSize: 14, marginTop: 8 }}>
              Please proceed to <strong style={{ color: '#36c9c5' }}>Triage Zone A</strong>
            </p>
          </div>

          <p style={{ color: '#6b7280', fontSize: 12, textAlign: 'center' }}>
            A licensed clinician will review your case. Please remain in the waiting area.
          </p>
        </div>
      )}
    </BoothLayout>
  );
}
