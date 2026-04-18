'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { CTASBadge } from '@/components/dashboard/CTASBadge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import type { TriageSession, DeviceMeasurement, AuditEvent, TriageAnswer } from '@/types/api';

type Tab = 'summary' | 'vitals' | 'answers' | 'audit';

const STEP_LABELS: Record<string, string> = {
  first_look: 'Emergency Screening',
  complaint: 'Chief Complaint',
  symptom_detail: 'Pain & Severity',
  vitals: 'Vital Signs',
};

const AUDIT_COLORS: Record<string, string> = {
  SESSION_START: '#2563eb',
  DEVICE_READ: '#16a34a',
  CTAS_SCORED: '#ca8a04',
  ALARM_TRIGGERED: '#dc2626',
  AVATAR_SESSION_CREATED: '#36c9c5',
  AVATAR_SESSION_CLOSED: '#6b7280',
};

export default function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [session, setSession] = useState<TriageSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('summary');
  const [overrideLevel, setOverrideLevel] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) { router.replace('/login'); return; }
    api.getCaseDetail(caseId).then((res) => setSession(res.data)).finally(() => setLoading(false));
  }, [caseId, accessToken, router]);

  async function handleOverride() {
    if (!overrideLevel) return;
    setActionLoading(true);
    try {
      await api.executeAction(caseId, 'OVERRIDE_CTAS', {
        new_level: Number(overrideLevel),
        reason: overrideReason || 'No reason provided',
      });
      const res = await api.getCaseDetail(caseId);
      setSession(res.data);
      setOverrideLevel('');
      setOverrideReason('');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMarkSeen() {
    setActionLoading(true);
    try {
      await api.executeAction(caseId, 'MARK_SEEN');
      const res = await api.getCaseDetail(caseId);
      setSession(res.data);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0f1e' }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!session) return null;

  const measurements: DeviceMeasurement[] = session.measurements ?? [];
  const auditEvents: AuditEvent[] = session.audit_events ?? [];
  const bp = measurements.find((m) => m.device_type === 'BLOOD_PRESSURE');

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0f1e' }}>
      {/* Header */}
      <div
        className="flex items-center gap-4 px-6 py-4"
        style={{ backgroundColor: '#111827', borderBottom: '1px solid #374151' }}
      >
        <button
          onClick={() => router.back()}
          style={{ color: '#36c9c5', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}
        >
          ←
        </button>
        <div className="flex items-center gap-3 flex-1">
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#9ca3af', fontSize: 13 }}>
            #{session.id.slice(-8).toUpperCase()}
          </span>
          {session.ctas_level && <CTASBadge level={session.ctas_level} size="sm" />}
          <span
            style={{
              backgroundColor: session.status === 'COMPLETED' ? '#1a3a1a' : '#1f2937',
              color: session.status === 'COMPLETED' ? '#4ade80' : '#9ca3af',
              border: `1px solid ${session.status === 'COMPLETED' ? '#16a34a' : '#374151'}`,
              padding: '2px 10px',
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {session.status}
          </span>
        </div>
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          {new Date(session.created_at).toLocaleTimeString()}
        </span>
      </div>

      {/* Tabs */}
      <div
        className="flex"
        style={{ backgroundColor: '#111827', borderBottom: '1px solid #374151' }}
      >
        {(['summary', 'vitals', 'answers', 'audit'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-6 py-3 text-sm font-semibold capitalize transition-all"
            style={{
              color: tab === t ? '#36c9c5' : '#6b7280',
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid #36c9c5' : '2px solid transparent',
              cursor: 'pointer',
              minHeight: 48,
            }}
          >
            {t === 'audit' ? 'Audit Log' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Summary Tab */}
        {tab === 'summary' && (
          <div className="flex flex-col gap-5">
            {session.reasoning_summary && (
              <div className="rounded-xl p-4" style={{ backgroundColor: '#111827', border: '1px solid #374151' }}>
                <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>TRIAGE REASONING</p>
                <p style={{ color: '#d1d5db', fontSize: 14, lineHeight: 1.6 }}>{session.reasoning_summary}</p>
              </div>
            )}

            {session.red_flags.length > 0 && (
              <div className="rounded-xl p-4" style={{ backgroundColor: '#111827', border: '1px solid rgba(220,38,38,0.3)' }}>
                <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>RED FLAGS</p>
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

            {/* Override CTAS */}
            <div className="rounded-xl p-4" style={{ backgroundColor: '#111827', border: '1px solid #374151' }}>
              <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>CLINICIAN ACTIONS</p>
              <div className="flex gap-3 flex-wrap">
                <select
                  value={overrideLevel}
                  onChange={(e) => setOverrideLevel(e.target.value)}
                  className="rounded-lg px-3 py-2"
                  style={{ backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f9fafb', fontSize: 14 }}
                >
                  <option value="">Override CTAS…</option>
                  {[1, 2, 3, 4, 5].map((l) => (
                    <option key={l} value={l}>CTAS {l}</option>
                  ))}
                </select>
                {overrideLevel && (
                  <input
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Reason for override"
                    className="flex-1 rounded-lg px-3 py-2"
                    style={{ backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f9fafb', fontSize: 14, outline: 'none' }}
                  />
                )}
                {overrideLevel && (
                  <button
                    onClick={handleOverride}
                    disabled={actionLoading}
                    className="rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
                    style={{ backgroundColor: '#ca8a04', color: '#fff', border: 'none', fontSize: 14 }}
                  >
                    Apply
                  </button>
                )}
                <button
                  onClick={handleMarkSeen}
                  disabled={actionLoading || session.status === 'COMPLETED'}
                  className="rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
                  style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', fontSize: 14 }}
                >
                  Mark Seen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Vitals Tab */}
        {tab === 'vitals' && (
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Systolic BP', value: bp?.raw_readings?.systolic, unit: 'mmHg', ref: '< 120' },
              { label: 'Diastolic BP', value: bp?.raw_readings?.diastolic, unit: 'mmHg', ref: '< 80' },
              { label: 'Classification', value: bp?.classification, unit: '', ref: 'Normal' },
              { label: 'SpO₂', value: '—', unit: '%', ref: '> 95%' },
            ].map(({ label, value, unit, ref }) => (
              <div
                key={label}
                className="rounded-2xl p-5 text-center"
                style={{ backgroundColor: '#111827', border: '1px solid #374151' }}
              >
                <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{label}</p>
                <p
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 32,
                    fontWeight: 700,
                    color: '#36c9c5',
                  }}
                >
                  {value ?? '—'}
                </p>
                {unit && <p style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>{unit}</p>}
                <p style={{ color: '#4b5563', fontSize: 11, marginTop: 6 }}>Ref: {ref}</p>
              </div>
            ))}
          </div>
        )}

        {/* Answers Tab */}
        {tab === 'answers' && (
          <div className="flex flex-col gap-3">
            {session.answers.length === 0 ? (
              <p style={{ color: '#6b7280', textAlign: 'center', paddingTop: 32 }}>No answers recorded.</p>
            ) : (
              session.answers.map((answer: TriageAnswer) => (
                <div
                  key={answer.id}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: '#111827', border: '1px solid #374151' }}
                >
                  <p style={{ color: '#36c9c5', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                    {STEP_LABELS[answer.step_name] ?? answer.step_name.replace(/_/g, ' ').toUpperCase()}
                  </p>
                  <p style={{ color: '#f9fafb', fontSize: 14, lineHeight: 1.5 }}>{answer.raw_input}</p>
                  {Object.keys(answer.parsed_data).length > 0 && (
                    <details className="mt-3">
                      <summary style={{ color: '#6b7280', fontSize: 12, cursor: 'pointer' }}>
                        AI parsed data
                      </summary>
                      <pre
                        style={{
                          color: '#9ca3af',
                          fontSize: 11,
                          marginTop: 6,
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      >
                        {JSON.stringify(answer.parsed_data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Audit Log Tab */}
        {tab === 'audit' && (
          <div className="relative">
            <div
              className="absolute left-5 top-0 bottom-0 w-px"
              style={{ backgroundColor: '#374151' }}
            />
            <div className="flex flex-col gap-4 pl-12">
              {auditEvents.length === 0 ? (
                <p style={{ color: '#6b7280', paddingTop: 32 }}>No audit events recorded.</p>
              ) : (
                auditEvents.map((event: AuditEvent) => (
                  <div key={event.id} className="relative">
                    <div
                      className="absolute -left-7 w-3 h-3 rounded-full"
                      style={{ backgroundColor: AUDIT_COLORS[event.event_type] ?? '#6b7280', top: 4 }}
                    />
                    <div
                      className="rounded-xl p-3"
                      style={{ backgroundColor: '#111827', border: '1px solid #374151' }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          style={{
                            color: AUDIT_COLORS[event.event_type] ?? '#9ca3af',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {event.event_type.replace(/_/g, ' ')}
                        </span>
                        <span style={{ color: '#6b7280', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p style={{ color: '#d1d5db', fontSize: 13 }}>{event.description}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
