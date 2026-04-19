'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { DashboardWebSocket } from '@/lib/websocket';
import {
  patientDisplayId,
  classifyBp,
  classifyTemp,
  splitReasoning,
  STEP_LABELS,
  AUDIT_COLORS,
  TIMELINE_DOT_COLORS,
} from '@/lib/dashboard-utils';
import { useAuthStore } from '@/store/auth';
import { useDashboardStore } from '@/store/dashboard';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { QueuePanel } from '@/components/dashboard/QueuePanel';
import { CTASBadge } from '@/components/dashboard/CTASBadge';
import { VitalCard } from '@/components/dashboard/VitalCard';
import { EmergencyAlertModal } from '@/components/dashboard/EmergencyAlertModal';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import type { TriageSession, DeviceMeasurement, AuditEvent, TriageAnswer } from '@/types/api';

type Tab = 'summary' | 'vitals' | 'answers' | 'audit';

export default function DashboardPage() {
  return (
    <Suspense fallback={<div style={{ backgroundColor: '#051414', minHeight: '100vh' }} />}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseParam = searchParams.get('case');
  const { accessToken } = useAuthStore();
  const { queue, setQueue, updateQueueItem, emergencyAlert, setEmergencyAlert, clearEmergencyAlert } =
    useDashboardStore();

  const [tab, setTab] = useState<Tab>('summary');
  const [caseDetail, setCaseDetail] = useState<TriageSession | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [overrideLevel, setOverrideLevel] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
      return;
    }

    api.getQueue().then((res) => {
      setQueue(res.data);
      const current = new URL(window.location.href).searchParams.get('case');
      if (!current && res.data.length > 0) {
        router.replace(`/dashboard?case=${res.data[0].id}`);
      }
    });

    const ws = new DashboardWebSocket(
      accessToken,
      (sessionId, data) => updateQueueItem(sessionId, data),
      (alert) => setEmergencyAlert(alert)
    );
    ws.connect();
    return () => ws.disconnect();
  }, [accessToken, router, setQueue, updateQueueItem, setEmergencyAlert]);

  useEffect(() => {
    if (!caseParam || !accessToken) {
      setCaseDetail(null);
      return;
    }
    setCaseLoading(true);
    api
      .getCaseDetail(caseParam)
      .then((res) => setCaseDetail(res.data))
      .finally(() => setCaseLoading(false));
  }, [caseParam, accessToken]);

  const activeCount = queue.filter((s) => s.status !== 'COMPLETED').length;

  function selectCase(id: string) {
    router.replace(`/dashboard?case=${id}`);
    setTab('summary');
  }

  async function refreshCase() {
    if (!caseParam) return;
    const res = await api.getCaseDetail(caseParam);
    setCaseDetail(res.data);
  }

  async function handleOverride() {
    if (!overrideLevel || !caseParam) return;
    setActionLoading(true);
    try {
      await api.executeAction(caseParam, 'OVERRIDE_CTAS', {
        new_level: Number(overrideLevel),
        reason: overrideReason || 'No reason provided',
      });
      await refreshCase();
      setOverrideLevel('');
      setOverrideReason('');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMarkSeen() {
    if (!caseParam) return;
    setActionLoading(true);
    try {
      await api.executeAction(caseParam, 'MARK_SEEN');
      await refreshCase();
    } finally {
      setActionLoading(false);
    }
  }

  if (!accessToken) return null;

  return (
    <>
      {/* ── Top Navigation ─────────────────────────────────── */}
      <DashboardNav
        activeBoothCount={activeCount}
        hasAlert={!!emergencyAlert}
      />

      {/* ── Master / Detail body ───────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <QueuePanel
          queue={queue}
          selectedCaseId={caseParam}
          onSelectCase={selectCase}
        />

        {/* Main panel */}
        <main className="flex-1 overflow-y-auto">
          {caseLoading ? (
            <div className="flex h-full items-center justify-center">
              <LoadingSpinner size="lg" />
            </div>
          ) : caseDetail ? (
            <CasePanel
              session={caseDetail}
              tab={tab}
              setTab={setTab}
              overrideLevel={overrideLevel}
              setOverrideLevel={setOverrideLevel}
              overrideReason={overrideReason}
              setOverrideReason={setOverrideReason}
              actionLoading={actionLoading}
              onOverride={handleOverride}
              onMarkSeen={handleMarkSeen}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-text-dim">
              Select a patient to view case details
            </div>
          )}
        </main>
      </div>

      {emergencyAlert && (
        <EmergencyAlertModal
          alert={emergencyAlert}
          onView={() => {
            selectCase(emergencyAlert.sessionId);
            clearEmergencyAlert();
          }}
          onDismiss={clearEmergencyAlert}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Case detail panel
// ─────────────────────────────────────────────────────────────

interface CasePanelProps {
  session: TriageSession;
  tab: Tab;
  setTab: (t: Tab) => void;
  overrideLevel: string;
  setOverrideLevel: (v: string) => void;
  overrideReason: string;
  setOverrideReason: (v: string) => void;
  actionLoading: boolean;
  onOverride: () => void;
  onMarkSeen: () => void;
}

function CasePanel({
  session,
  tab,
  setTab,
  overrideLevel,
  setOverrideLevel,
  overrideReason,
  setOverrideReason,
  actionLoading,
  onOverride,
  onMarkSeen,
}: CasePanelProps) {
  const answers = session.answers ?? [];
  const complaint = answers.find((a) => a.step_name === 'complaint')?.raw_input;
  const measurements: DeviceMeasurement[] = session.measurements ?? [];
  const auditEvents: AuditEvent[] = session.audit_events ?? [];

  return (
    <div className="flex flex-col">
      {/* Case header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px', borderBottom: '1px solid #155150', backgroundColor: '#071c1c', flexWrap: 'wrap' }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', color: '#2aa2a0', fontSize: 13, fontWeight: 500 }}>
          {patientDisplayId(session)}
        </span>
        {session.ctas_level && <CTASBadge level={session.ctas_level} size="sm" />}
        {complaint && (
          <span style={{ color: '#f0fffe', fontSize: 16, fontWeight: 700 }}>{complaint}</span>
        )}
        {(session.red_flags ?? []).length > 0 && (
          <>
            <span style={{ color: '#207976' }}>→</span>
            <span style={{ color: '#2aa2a0', fontSize: 13 }}>
              {(session.red_flags ?? []).some(f => /cardiac|heart/i.test(f)) ? 'Cardiac Emergency' : 'Clinical Review'}
            </span>
          </>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <button
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: 'transparent',
              border: '1px solid #155150',
              color: '#86dfdc',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 'auto',
            }}
          >
            <span style={{ fontSize: 12 }}>⤢</span> Expand
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-6" style={{ borderBottom: '1px solid #155150' }}>
        {(['summary', 'vitals', 'answers', 'audit'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-3 text-sm font-semibold capitalize transition-all"
            style={{
              color: tab === t ? '#36c9c5' : '#207976',
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid #36c9c5' : '2px solid transparent',
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            {t === 'audit' ? 'Audit Log' : t}
          </button>
        ))}
      </div>

      <div className="p-6">
        {tab === 'summary' && (
          <SummaryView
            session={session}
            measurements={measurements}
            auditEvents={auditEvents}
            overrideLevel={overrideLevel}
            setOverrideLevel={setOverrideLevel}
            overrideReason={overrideReason}
            setOverrideReason={setOverrideReason}
            actionLoading={actionLoading}
            onOverride={onOverride}
            onMarkSeen={onMarkSeen}
          />
        )}
        {tab === 'vitals' && <VitalsView measurements={measurements} />}
        {tab === 'answers' && <AnswersView answers={answers} />}
        {tab === 'audit' && <AuditView events={auditEvents} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Summary view
// ─────────────────────────────────────────────────────────────

function SummaryView({
  session,
  measurements,
  auditEvents,
  overrideLevel,
  setOverrideLevel,
  overrideReason,
  setOverrideReason,
  actionLoading,
  onOverride,
  onMarkSeen,
}: {
  session: TriageSession;
  measurements: DeviceMeasurement[];
  auditEvents: AuditEvent[];
  overrideLevel: string;
  setOverrideLevel: (v: string) => void;
  overrideReason: string;
  setOverrideReason: (v: string) => void;
  actionLoading: boolean;
  onOverride: () => void;
  onMarkSeen: () => void;
}) {
  const bullets = splitReasoning(session.reasoning_summary);
  const hasChestPain = (session.red_flags ?? []).some((f) =>
    /chest|cardiac|pain/i.test(f)
  );
  const lowConfidence = !session.ctas_level || (session.answers ?? []).length < 3;

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: '1fr' }}>
      {/* Triage Reasoning */}
      <section
        style={{ backgroundColor: '#0b2827', border: '1px solid #155150', borderRadius: 12, padding: '20px 24px' }}
      >
        <p style={{ color: '#36c9c5', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>TRIAGE REASONING</p>
        {bullets.length === 0 ? (
          <p style={{ color: '#207976', fontSize: 13 }}>Reasoning will appear once triage completes.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bullets.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ color: '#36c9c5', fontSize: 14, lineHeight: 1.5, flexShrink: 0 }}>›</span>
                <span style={{ color: '#86dfdc', fontSize: 13, lineHeight: 1.6 }}>{b}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Chest-pain alert banner */}
      {hasChestPain && (
        <section
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
            backgroundColor: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.35)',
            borderRadius: 10,
          }}
        >
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontSize: 14 }}>🚨</span>
          <span style={{ color: '#fca5a5', fontSize: 13, fontWeight: 600 }}>
            Active Chest Pain — cardiac protocol engaged
          </span>
        </section>
      )}

      {/* Red flags */}
      {(session.red_flags ?? []).length > 0 && (
        <section
          className="rounded-xl p-4"
          style={{
            backgroundColor: '#0b2827',
            border: '1px solid rgba(220,38,38,0.35)',
          }}
        >
          <p style={{ color: '#2aa2a0', fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
            RED FLAGS
          </p>
          <div className="flex flex-wrap gap-2">
            {(session.red_flags ?? []).map((flag) => (
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
        </section>
      )}

      {/* Medium-confidence warning */}
      {lowConfidence && (
        <section
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
            backgroundColor: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)',
            borderRadius: 10,
          }}
        >
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ color: '#fcd34d', fontSize: 13, fontWeight: 600 }}>
            Medium Confidence — {(session.answers ?? []).length} question{(session.answers ?? []).length === 1 ? '' : 's'} skipped
          </span>
        </section>
      )}

      {/* Action buttons row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => setOverrideLevel(overrideLevel ? '' : '1')}
          style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, minHeight: 'auto', backgroundColor: 'transparent', border: '1px solid #dc2626', color: '#fca5a5' }}
        >
          Override CTAS
        </button>
        <button style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, minHeight: 'auto', backgroundColor: '#36c9c5', border: '1px solid #36c9c5', color: '#051414' }}>
          Escalate
        </button>
        <button style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, minHeight: 'auto', backgroundColor: 'transparent', border: '1px solid #155150', color: '#86dfdc' }}>
          Route to…
        </button>
        <button
          onClick={onMarkSeen}
          disabled={actionLoading || session.status === 'COMPLETED'}
          style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, minHeight: 'auto', backgroundColor: 'transparent', border: '1px solid #155150', color: '#86dfdc', opacity: (actionLoading || session.status === 'COMPLETED') ? 0.5 : 1 }}
        >
          Mark Seen
        </button>
      </div>

      {/* Override panel (when active) */}
      {overrideLevel && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={overrideLevel} onChange={(e) => setOverrideLevel(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, backgroundColor: '#0d3635', border: '1px solid #155150', color: '#f0fffe', minHeight: 'auto' }}>
            {[1,2,3,4,5].map(l => <option key={l} value={l}>CTAS {l}</option>)}
          </select>
          <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Reason" style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 8, fontSize: 12, backgroundColor: '#0d3635', border: '1px solid #155150', color: '#f0fffe', outline: 'none', minHeight: 'auto' }} />
          <button onClick={onOverride} disabled={actionLoading} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, backgroundColor: '#dc2626', color: '#fff', border: 'none', minHeight: 'auto', opacity: actionLoading ? 0.5 : 1 }}>Apply</button>
        </div>
      )}

      {/* Inline Vitals */}
      <VitalsView measurements={measurements} />

      {/* Session Timeline */}
      {auditEvents.length > 0 && <TimelineView events={auditEvents} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Vitals view
// ─────────────────────────────────────────────────────────────

function VitalsView({ measurements }: { measurements: DeviceMeasurement[] }) {
  const bp = measurements.find((m) => m.device_type === 'BLOOD_PRESSURE');
  const temp = measurements.find((m) => m.device_type === 'TEMPERATURE');

  const systolic = bp?.raw_readings?.systolic;
  const diastolic = bp?.raw_readings?.diastolic;
  const tempF = temp?.raw_readings?.temperature ?? temp?.raw_readings?.value;

  const sysCls = classifyBp(systolic);
  const tempCls = classifyTemp(tempF);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
      <VitalCard
        label="Blood Pressure"
        icon="🩺"
        value={systolic && diastolic ? `${systolic}/${diastolic}` : '—'}
        unit="mmHg"
        classification={bp?.classification ?? sysCls.label}
        tone={sysCls.tone}
        fillPct={systolic ? ((systolic - 70) / (190 - 70)) * 100 : null}
      />
      <VitalCard
        label="Temperature"
        icon="🌡"
        value={tempF != null ? `${tempF}` : '—'}
        unit="°C"
        classification={temp?.classification ?? tempCls.label}
        tone={tempCls.tone}
        fillPct={tempF != null ? ((tempF - 95) / (104 - 95)) * 100 : null}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Session Timeline (compact, for Summary tab)
// ─────────────────────────────────────────────────────────────



function TimelineView({ events }: { events: AuditEvent[] }) {
  return (
    <section
      style={{ backgroundColor: '#0b2827', border: '1px solid #155150', borderRadius: 12, padding: '20px 24px' }}
    >
      <p style={{ color: '#36c9c5', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>SESSION TIMELINE</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {events.map((event) => {
          const dotColor = TIMELINE_DOT_COLORS[event.event_type] ?? '#207976';
          return (
            <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: dotColor,
                  marginTop: 5,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: '#2aa2a0',
                  flexShrink: 0,
                  minWidth: 65,
                }}
              >
                {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span style={{ fontSize: 13, color: '#86dfdc' }}>{event.description}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Answers view
// ─────────────────────────────────────────────────────────────

function AnswersView({ answers }: { answers: TriageAnswer[] }) {
  if (!answers || answers.length === 0) {
    return (
      <p style={{ color: '#207976', textAlign: 'center', paddingTop: 32, fontSize: 13 }}>
        No answers recorded yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {answers.map((answer) => (
        <div
          key={answer.id}
          className="rounded-xl p-4"
          style={{ backgroundColor: '#0b2827', border: '1px solid #155150' }}
        >
          <p style={{ color: '#36c9c5', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
            {STEP_LABELS[answer.step_name] ?? answer.step_name.replace(/_/g, ' ').toUpperCase()}
          </p>
          <p style={{ color: '#f0fffe', fontSize: 14, lineHeight: 1.5 }}>{answer.raw_input}</p>
          {Object.keys(answer.parsed_data).length > 0 && (
            <details className="mt-3">
              <summary style={{ color: '#207976', fontSize: 12, cursor: 'pointer' }}>
                AI parsed data
              </summary>
              <pre
                style={{
                  color: '#2aa2a0',
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
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Audit / Session Timeline view
// ─────────────────────────────────────────────────────────────

function AuditView({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <p style={{ color: '#207976', textAlign: 'center', paddingTop: 32, fontSize: 13 }}>
        No audit events recorded yet.
      </p>
    );
  }

  return (
    <div className="relative">
      <div
        className="absolute left-[10px] top-1 bottom-1 w-px"
        style={{ backgroundColor: '#155150' }}
      />
      <div className="flex flex-col gap-3 pl-8">
        {events.map((event) => (
          <div key={event.id} className="relative">
            <div
              className="absolute w-3 h-3 rounded-full"
              style={{
                backgroundColor: AUDIT_COLORS[event.event_type] ?? '#207976',
                left: -26,
                top: 6,
              }}
            />
            <div
              className="rounded-xl p-3"
              style={{ backgroundColor: '#0b2827', border: '1px solid #155150' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  style={{
                    color: AUDIT_COLORS[event.event_type] ?? '#2aa2a0',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {event.event_type.replace(/_/g, ' ')}
                </span>
                <span
                  style={{
                    color: '#207976',
                    fontSize: 11,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p style={{ color: '#86dfdc', fontSize: 13 }}>{event.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
