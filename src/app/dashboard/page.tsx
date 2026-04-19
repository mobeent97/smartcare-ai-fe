'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { DashboardWebSocket } from '@/lib/websocket';
import { useAuthStore } from '@/store/auth';
import { useDashboardStore } from '@/store/dashboard';
import { CTASBadge } from '@/components/dashboard/CTASBadge';
import {
  PatientListCard,
  patientDisplayId,
  priorityScore,
} from '@/components/dashboard/PatientListCard';
import { VitalCard } from '@/components/dashboard/VitalCard';
import { EmergencyAlertModal } from '@/components/dashboard/EmergencyAlertModal';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import type { TriageSession, DeviceMeasurement, AuditEvent, TriageAnswer } from '@/types/api';

type Tab = 'summary' | 'vitals' | 'answers' | 'audit';
type SortKey = 'priority' | 'arrived' | 'wait';

const STEP_LABELS: Record<string, string> = {
  first_look: 'Emergency Screening',
  complaint: 'Chief Complaint',
  symptom_detail: 'Pain & Severity',
  vitals: 'Vital Signs',
};

const AUDIT_COLORS: Record<string, string> = {
  SESSION_START: '#3b82f6',
  DEVICE_READ: '#22c55e',
  CTAS_SCORED: '#eab308',
  ALARM_TRIGGERED: '#dc2626',
  AVATAR_SESSION_CREATED: '#36c9c5',
  AVATAR_SESSION_CLOSED: '#207976',
};

function classifyBp(systolic?: number): {
  label: string;
  tone: 'green' | 'amber' | 'orange' | 'red' | 'muted';
} {
  if (systolic == null) return { label: '—', tone: 'muted' };
  if (systolic < 120) return { label: 'Normal', tone: 'green' };
  if (systolic < 130) return { label: 'Elevated', tone: 'amber' };
  if (systolic < 140) return { label: 'Stage 1 HTN', tone: 'orange' };
  if (systolic < 180) return { label: 'Stage 2 HTN', tone: 'red' };
  return { label: 'Hypertensive Crisis', tone: 'red' };
}

function classifyTemp(f?: number): {
  label: string;
  tone: 'green' | 'amber' | 'orange' | 'red' | 'muted';
} {
  if (f == null) return { label: '—', tone: 'muted' };
  if (f < 97) return { label: 'Hypothermia', tone: 'amber' };
  if (f < 99.5) return { label: 'Normal', tone: 'green' };
  if (f < 100.9) return { label: 'Low-grade Fever', tone: 'amber' };
  if (f < 103) return { label: 'Fever', tone: 'orange' };
  return { label: 'High Fever', tone: 'red' };
}

function splitReasoning(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function sortPatients(queue: TriageSession[], key: SortKey): TriageSession[] {
  const copy = [...queue];
  if (key === 'priority') {
    return copy.sort((a, b) => priorityScore(b) - priorityScore(a));
  }
  if (key === 'wait') {
    return copy.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }
  return copy.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

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
  const { accessToken, userEmail, logout } = useAuthStore();
  const { queue, setQueue, updateQueueItem, emergencyAlert, setEmergencyAlert, clearEmergencyAlert } =
    useDashboardStore();

  const [sortKey, setSortKey] = useState<SortKey>('priority');
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
        const first = sortPatients(res.data, 'priority')[0];
        router.replace(`/dashboard?case=${first.id}`);
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

  const sorted = useMemo(() => sortPatients(queue, sortKey), [queue, sortKey]);
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
    <div className="min-h-screen" style={{ backgroundColor: '#051414' }}>
      {/* ── Top header ─────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-6"
        style={{ backgroundColor: '#071c1c', borderBottom: '1px solid #155150', height: 48 }}
      >
        <div className="flex items-center gap-3">
          <span style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#36c9c5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#051414' }}>+</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#f0fffe' }}>SmartCare</span>
          <span style={{ color: '#155150', fontSize: 14 }}>|</span>
          <span style={{ color: '#36c9c5', fontSize: 13, fontWeight: 500 }}>Clinician Dashboard</span>
        </div>

        <div className="flex items-center gap-4">
          <span
            className="flex items-center gap-2"
            style={{
              color: '#36c9c5',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 14 }}>🖥</span>
            {activeCount} Booths Active
          </span>

          <button
            aria-label="Notifications"
            className="relative"
            style={{
              background: 'none',
              border: 'none',
              color: '#2aa2a0',
              cursor: 'pointer',
              fontSize: 18,
              minHeight: 'auto',
              padding: 4,
            }}
          >
            🔔
            {emergencyAlert && (
              <span
                className="absolute -top-1 -right-1"
                style={{
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  fontSize: 9,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                2
              </span>
            )}
          </button>

          <div className="flex items-center gap-2">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                backgroundColor: '#36c9c5',
                color: '#051414',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {(userEmail ?? '?').charAt(0).toUpperCase()}
            </div>
            <span style={{ color: '#86dfdc', fontSize: 13 }}>{userEmail}</span>
          </div>

          <button
            onClick={() => {
              logout();
              router.replace('/login');
            }}
            style={{
              color: '#207976',
              fontSize: 12,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Master / Detail body ───────────────────────────────── */}
      <div className="flex" style={{ height: 'calc(100vh - 48px)' }}>
        {/* Sidebar */}
        <aside
          className="flex flex-col"
          style={{
            width: 240,
            backgroundColor: '#071c1c',
            borderRight: '1px solid #155150',
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid rgba(21,81,80,0.5)' }}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: '#f0fffe', fontSize: 13, fontWeight: 700 }}>Active Patients</span>
              <span style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: '#36c9c5', color: '#051414', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{queue.length}</span>
            </div>
          </div>
          <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(21,81,80,0.5)' }}>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: 8,
                backgroundColor: 'transparent',
                border: '1px solid #155150',
                color: '#36c9c5',
                fontSize: 11,
                outline: 'none',
                minHeight: 'auto',
              }}
            >
              <option value="priority">↕ Sort by Priority</option>
              <option value="wait">↕ Sort by Wait time</option>
              <option value="arrived">↕ Sort by Newest</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {sorted.length === 0 ? (
              <div className="text-center py-12" style={{ color: '#207976', fontSize: 13 }}>
                No patients in queue
              </div>
            ) : (
              sorted.map((s) => (
                <PatientListCard
                  key={s.id}
                  session={s}
                  selected={s.id === caseParam}
                  onClick={() => selectCase(s.id)}
                />
              ))
            )}
          </div>
        </aside>

        {/* Main panel */}
        <main className="flex-1 overflow-y-auto">
          {caseLoading ? (
            <div className="h-full flex items-center justify-center">
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
            <div
              className="h-full flex items-center justify-center"
              style={{ color: '#207976', fontSize: 14 }}
            >
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
    </div>
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

const TIMELINE_DOT_COLORS: Record<string, string> = {
  SESSION_START: '#3b82f6',
  CONSENT_GIVEN: '#22c55e',
  DEVICE_READ: '#22c55e',
  CTAS_SCORED: '#eab308',
  ALARM_TRIGGERED: '#dc2626',
  AVATAR_SESSION_CREATED: '#36c9c5',
  AVATAR_SESSION_CLOSED: '#207976',
  FIRST_LOOK: '#22c55e',
  COMPLAINT: '#ea580c',
  SEVERITY: '#eab308',
  RED_FLAG: '#dc2626',
};

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
