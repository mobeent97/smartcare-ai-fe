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
import { CaseHeader } from '@/components/dashboard/CaseHeader';
import { CaseDetailTabs, type Tab } from '@/components/dashboard/CaseDetailTabs';
import { ActionPanel } from '@/components/dashboard/ActionPanel';
import { TriageReasoning } from '@/components/dashboard/TriageReasoning';
import { RedFlagAlert } from '@/components/dashboard/RedFlagAlert';
import { ConfidenceWarning } from '@/components/dashboard/ConfidenceWarning';
import { SessionTimeline } from '@/components/dashboard/SessionTimeline';
import { VitalsPanel } from '@/components/dashboard/VitalsPanel';
import { AnswerList } from '@/components/dashboard/AnswerList';
import { AuditTimeline } from '@/components/dashboard/AuditTimeline';
import type { TriageSession, DeviceMeasurement, AuditEvent, TriageAnswer } from '@/types/api';

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
      <CaseHeader session={session} complaint={complaint} />
      <CaseDetailTabs activeTab={tab} onTabChange={setTab} />

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
        {tab === 'vitals' && <VitalsPanel measurements={measurements} />}
        {tab === 'answers' && <AnswerList answers={answers} />}
        {tab === 'audit' && <AuditTimeline events={auditEvents} />}
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
  const lowConfidence = !session.ctas_level || (session.answers ?? []).length < 3;

  return (
    <div className="grid grid-cols-1 gap-5">
      <TriageReasoning summary={session.reasoning_summary} />
      <RedFlagAlert flags={session.red_flags ?? []} />
      {lowConfidence && (
        <ConfidenceWarning answersCount={(session.answers ?? []).length} />
      )}

      <ActionPanel
        session={session}
        overrideLevel={overrideLevel}
        setOverrideLevel={setOverrideLevel}
        overrideReason={overrideReason}
        setOverrideReason={setOverrideReason}
        actionLoading={actionLoading}
        onOverride={onOverride}
        onMarkSeen={onMarkSeen}
      />

      {/* Inline Vitals */}
      <VitalsPanel measurements={measurements} />

      {/* Session Timeline */}
      <SessionTimeline events={auditEvents} />
    </div>
  );
}


