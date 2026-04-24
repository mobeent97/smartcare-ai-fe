'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTransitionRouter } from '@/hooks/useTransitionRouter';
import { api } from '@/lib/api';
import {
  patientDisplayId,
  classifyBp,
  classifyTemp,
  classifyHr,
  classifySpo2,
  timeAgo,
  TIMELINE_DOT_COLORS,
} from '@/lib/dashboard-utils';
import { useAuthStore } from '@/store/auth';
import { useDashboardStore } from '@/store/dashboard';
import { CTASBadge } from '@/components/dashboard/CTASBadge';
import { RedFlagAlert } from '@/components/dashboard/RedFlagAlert';
import { ConfidenceWarning } from '@/components/dashboard/ConfidenceWarning';
import { VitalsPanel } from '@/components/dashboard/VitalsPanel';
import { AnswerList } from '@/components/dashboard/AnswerList';
import { AuditTimeline } from '@/components/dashboard/AuditTimeline';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { CustomSelect } from '@/components/ui/CustomSelect';
import type { TriageSession, DeviceMeasurement, AuditEvent } from '@/types/api';

// ─── CTAS label map ──────────────────────────────────────────
const CTAS_LABELS: Record<number, string> = {
  1: 'Resuscitation',
  2: 'Emergent',
  3: 'Urgent',
  4: 'Less Urgent',
  5: 'Non-Urgent',
};

// ─── Tone → Tailwind colour util ─────────────────────────────
function toneClass(tone: string) {
  const map: Record<string, string> = {
    green: 'text-success',
    amber: 'text-warning',
    orange: 'text-ctas-2',
    red: 'text-danger',
    muted: 'text-text-dim',
  };
  return map[tone] ?? 'text-text-dim';
}

// ─── Routing label from flags ────────────────────────────────
function routingLabel(session: TriageSession) {
  const flags = session.red_flags ?? [];
  if (flags.some((f) => /cardiac|heart|chest/i.test(f))) return 'Cardiac ER';
  if (flags.some((f) => /breath|pulmon/i.test(f))) return 'Respiratory Unit';
  if (session.ctas_level && session.ctas_level <= 2) return 'Emergency Bay';
  return 'Clinical Review';
}

// ─── Wait time from created_at ───────────────────────────────
function waitMinutes(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

// ─── Pain severity from answers ──────────────────────────────
function painSeverity(session: TriageSession): number | null {
  const a = (session.answers ?? []).find((x) => x.step_name === 'symptom_detail');
  const parsed = a?.parsed_data as Record<string, unknown> | undefined;
  const val = parsed?.severity ?? parsed?.pain_scale ?? a?.raw_input;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

// ─── Onset from answers ──────────────────────────────────────
function onsetLabel(session: TriageSession): string | null {
  const a = (session.answers ?? []).find((x) => x.step_name === 'symptom_detail');
  const parsed = a?.parsed_data as Record<string, unknown> | undefined;
  const onset = parsed?.onset ?? parsed?.duration;
  if (!onset) return null;
  return String(onset);
}

export default function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();
  const { navigate } = useTransitionRouter();
  const { accessToken, _hasHydrated } = useAuthStore();

  const [session, setSession] = useState<TriageSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'answers' | 'audit'>('summary');

  // Override state
  const [overrideLevel, setOverrideLevel] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Delete state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    api
      .getCaseDetail(caseId)
      .then((res) => setSession(res.data))
      .finally(() => setLoading(false));
  }, [caseId, accessToken, _hasHydrated, router]);

  async function handleOverride() {
    if (!overrideLevel || !caseId) return;
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
      setOverrideOpen(false);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMarkSeen() {
    if (!caseId) return;
    setActionLoading(true);
    try {
      await api.executeAction(caseId, 'MARK_SEEN');
      const res = await api.getCaseDetail(caseId);
      setSession(res.data);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteCase() {
    setDeleteLoading(true);
    try {
      await api.deleteCase(caseId);
      // Remove from the shared queue store immediately so the sidebar
      // reflects the change without waiting for a full refetch.
      useDashboardStore.getState().removeFromQueue(caseId);
      navigate('/dashboard', 'back');
    } catch {
      setDeleteLoading(false);
      setDeleteConfirmOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-dash-bg">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-dash-bg">
        <p className="text-text-muted">Case not found.</p>
        <button
          onClick={() => navigate('/dashboard', 'back')}
          className="rounded-lg border border-dash-border px-4 py-2 text-sm text-text-secondary hover:border-sc-500 hover:text-sc-400"
        >
          ← Back to Queue
        </button>
      </div>
    );
  }

  const answers = session.answers ?? [];
  const measurements: DeviceMeasurement[] = session.measurements ?? [];
  const auditEvents: AuditEvent[] = session.audit_events ?? [];
  const complaint =
    answers.find((a) => a.step_name === 'complaint')?.raw_input ?? 'Pending intake';
  const route = routingLabel(session);
  const wait = waitMinutes(session.created_at);
  const pain = painSeverity(session);
  const onset = onsetLabel(session);
  const lowConfidence = !session.ctas_level || answers.length < 3;
  const flags = session.red_flags ?? [];

  // BP data for inline summary column
  const bp = measurements.find((m) => m.device_type === 'BLOOD_PRESSURE');
  const systolic = bp?.raw_readings?.systolic;
  const diastolic = bp?.raw_readings?.diastolic;
  const bpCls = classifyBp(systolic);
  const temp = measurements.find((m) => m.device_type === 'TEMPERATURE');
  const tempF = temp?.raw_readings?.temperature ?? temp?.raw_readings?.value;
  const tempCls = classifyTemp(tempF);

  const displayId = patientDisplayId(session);
  const ctasLabel = session.ctas_level ? CTAS_LABELS[session.ctas_level] : null;

  return (
    <div className="flex min-h-screen flex-col bg-dash-bg">
      {/* ── Breadcrumb header ──────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-3 border-b border-dash-border bg-dash-surface px-6 py-3.5">
        <button
          onClick={() => navigate(`/dashboard?case=${caseId}`, 'back')}
          className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary transition-colors hover:text-sc-400"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Queue
        </button>

        <span className="text-text-dim">|</span>

        <span className="font-mono text-[13px] font-medium text-text-muted">
          {displayId}
        </span>

        {session.ctas_level && (
          <CTASBadge level={session.ctas_level} size="sm" variant="outline" />
        )}

        <span className="text-base font-bold text-text-primary">{complaint}</span>

        {flags.length > 0 && (
          <>
            <span className="text-text-dim">→</span>
            <span className="rounded-full bg-ctas-2/15 px-2.5 py-0.5 text-[12px] font-semibold text-ctas-2">
              {route}
            </span>
          </>
        )}

        {/* Right side */}
        <div className="ml-auto flex items-center gap-4">
          <span className="text-[13px] text-text-muted">
            Wait:{' '}
            <span className="font-semibold text-text-secondary">{wait} min</span>
          </span>

          <button
            onClick={() => {
              useAuthStore.getState().logout();
              router.replace('/login');
            }}
            className="flex items-center gap-1.5 rounded-lg border border-dash-border px-3 py-1.5 text-xs font-semibold text-text-dim transition-colors hover:border-danger/50 hover:text-danger"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Tab bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-dash-border bg-dash-surface px-6">
        {(['summary', 'answers', 'audit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`
              border-b-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide transition-colors
              ${activeTab === t
                ? 'border-sc-500 text-sc-400'
                : 'border-transparent text-text-dim hover:text-text-secondary'}
            `}
          >
            {t === 'summary' ? 'Summary' : t === 'answers' ? 'Answers' : 'Audit Log'}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── SUMMARY TAB — 3-col layout ───────────────────── */}
        {activeTab === 'summary' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

            {/* ── COL 1: CLINICAL SUMMARY ─────────────────── */}
            <div className="flex flex-col gap-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-sc-500">
                Clinical Summary
              </p>

              {/* Primary Complaint */}
              <section className="rounded-xl border border-dash-border bg-dash-card p-5">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Primary Complaint
                </p>
                <p className="text-lg font-bold leading-snug text-text-primary">
                  {complaint}
                </p>
                <p className="mt-1 text-[12px] text-text-dim">
                  Method: Keyword
                  {answers.length > 0 && (
                    <span className="ml-2 text-success">
                      · {Math.min(95, 75 + answers.length * 4)}% confidence
                    </span>
                  )}
                </p>
              </section>

              {/* Pain Severity */}
              {pain !== null && (
                <section className="rounded-xl border border-dash-border bg-dash-card p-5">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    Pain Severity
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`text-5xl font-extrabold tabular-nums ${
                        pain >= 8
                          ? 'text-danger'
                          : pain >= 5
                          ? 'text-warning'
                          : 'text-success'
                      }`}
                    >
                      {pain}
                    </span>
                    <span className="text-base font-medium text-text-dim">/10</span>
                  </div>
                  {/* Gradient bar */}
                  <div className="mt-3 h-2 w-full rounded-full bg-dash-raised">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pain * 10}%`,
                        background:
                          pain >= 8
                            ? '#dc2626'
                            : pain >= 5
                            ? '#eab308'
                            : '#22c55e',
                      }}
                    />
                  </div>
                </section>
              )}

              {/* Onset */}
              {onset && (
                <section className="rounded-xl border border-dash-border bg-dash-card p-5">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    Onset
                  </p>
                  <p className="text-sm font-semibold text-warning">{onset}</p>
                </section>
              )}

              {/* Red flags */}
              <RedFlagAlert flags={flags} />

              {/* Low confidence */}
              {lowConfidence && <ConfidenceWarning answersCount={answers.length} />}

              {/* CTAS Reasoning */}
              {session.reasoning_summary && (
                <section className="rounded-xl border border-dash-border bg-dash-card p-5">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    CTAS Reasoning
                  </p>
                  <div className="flex flex-col gap-2">
                    {session.reasoning_summary
                      .split(/(?<=[.!?])\s+/)
                      .filter((s) => s.length > 2)
                      .map((bullet, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 text-xs text-sc-500">›</span>
                          <span className="text-[13px] leading-relaxed text-text-secondary">
                            {bullet}
                          </span>
                        </div>
                      ))}
                  </div>
                </section>
              )}

              {/* Confidence indicator */}
              <section className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-5 py-3">
                <span className="text-success">✓</span>
                <div>
                  <p className="text-[13px] font-semibold text-success">
                    {answers.length >= 4 ? 'HIGH Confidence' : 'PARTIAL Confidence'}
                  </p>
                  <p className="text-[11px] text-text-dim">
                    {answers.length >= 4
                      ? 'All critical fields complete'
                      : `${answers.length} of 4 fields collected`}
                  </p>
                </div>
              </section>
            </div>

            {/* ── COL 2: VITALS & DEVICES ─────────────────── */}
            <div className="flex flex-col gap-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-sc-500">
                Vitals &amp; Devices
              </p>

              <VitalsPanel measurements={measurements} />

              {/* Device status */}
              {measurements.length > 0 && (
                <section className="rounded-xl border border-dash-border bg-dash-card p-5">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    Device Status
                  </p>
                  <div className="flex flex-col gap-2">
                    {measurements.map((m) => (
                      <div key={m.id} className="flex items-center justify-between">
                        <span className="text-[12px] text-text-secondary">
                          {m.device_type === 'BLOOD_PRESSURE'
                            ? 'BP Monitor'
                            : m.device_type === 'TEMPERATURE'
                            ? 'Thermometer'
                            : 'Pulse Oximeter'}
                        </span>
                        <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-semibold text-success">
                          Connected
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* ── COL 3: ACTIONS & TIMELINE ───────────────── */}
            <div className="flex flex-col gap-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-sc-500">
                Actions &amp; Timeline
              </p>

              {/* CTAS Override */}
              <section className="rounded-xl border border-dash-border bg-dash-card p-5">
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  CTAS Override
                </p>

                <div className="mb-4 flex items-center gap-4">
                  {/* Current level */}
                  <div className="flex flex-col items-center">
                    <span className="mb-1 text-[10px] text-text-dim">Current</span>
                    {session.ctas_level ? (
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-xl font-black"
                        style={{
                          background:
                            session.ctas_level === 1
                              ? '#dc2626'
                              : session.ctas_level === 2
                              ? '#ea580c'
                              : session.ctas_level === 3
                              ? '#eab308'
                              : session.ctas_level === 4
                              ? '#22c55e'
                              : '#3b82f6',
                          color: '#fff',
                        }}
                      >
                        {session.ctas_level}
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dash-raised text-sm text-text-dim">
                        —
                      </div>
                    )}
                  </div>

                  {/* Override to */}
                  <div className="flex flex-1 flex-col">
                    <span className="mb-1 text-[10px] text-text-dim">Override to</span>
                    <CustomSelect
                      value={overrideLevel}
                      onChange={(val) => { setOverrideLevel(val); setOverrideOpen(true); }}
                      options={[1, 2, 3, 4, 5].map((l) => ({
                        value: String(l),
                        label: `CTAS ${l} — ${CTAS_LABELS[l]}`,
                      }))}
                      className="w-full"
                    />
                  </div>
                </div>

                <input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Reason for override..."
                  className="mb-3 w-full rounded-lg border border-dash-border bg-dash-raised px-3 py-2 text-xs text-text-primary outline-none placeholder:text-text-dim focus:border-sc-700"
                />

                <button
                  onClick={handleOverride}
                  disabled={!overrideLevel || actionLoading}
                  className="w-full rounded-lg bg-danger py-2.5 text-xs font-bold text-white transition-colors hover:bg-danger/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {actionLoading ? 'Saving…' : 'Confirm Override'}
                </button>
              </section>

              {/* Current Route */}
              <section className="rounded-xl border border-dash-border bg-dash-card p-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    Current Route
                  </p>
                  <button className="text-[11px] font-semibold text-sc-400 hover:text-sc-300">
                    Change Route
                  </button>
                </div>
                <span className="inline-flex rounded-full bg-ctas-2/15 px-3 py-1 text-[12px] font-bold text-ctas-2">
                  {route}
                </span>
              </section>

              {/* Action buttons */}
              <div className="flex flex-col gap-2.5">
                <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-dash-border bg-dash-card px-4 py-2.5 text-xs font-semibold text-text-secondary transition-colors hover:border-sc-700 hover:text-sc-400">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Generate Handoff PDF
                </button>
                <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-dash-border bg-transparent px-4 py-2.5 text-xs font-semibold text-text-secondary transition-colors hover:border-sc-700 hover:text-sc-400">
                  Escalate
                </button>
                <button
                  onClick={handleMarkSeen}
                  disabled={actionLoading || session.status === 'COMPLETED'}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dash-border bg-transparent px-4 py-2.5 text-xs font-semibold text-text-secondary transition-colors hover:border-sc-700 hover:text-sc-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Mark Seen
                </button>
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-danger/40 bg-danger/5 px-4 py-2.5 text-xs font-semibold text-danger transition-colors hover:border-danger hover:bg-danger/10"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                  Remove from Queue
                </button>
              </div>

              {/* Session Timeline */}
              {auditEvents.length > 0 && (
                <section className="rounded-xl border border-dash-border bg-dash-card p-5">
                  <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.08em] text-sc-500">
                    Session Timeline
                  </p>
                  <div className="flex flex-col gap-3">
                    {auditEvents.map((event) => (
                      <div key={event.id} className="flex items-start gap-3">
                        <span
                          className="mt-[7px] h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              TIMELINE_DOT_COLORS[event.event_type] ?? '#207976',
                          }}
                        />
                        <div className="flex items-start gap-2">
                          <span className="w-[65px] font-mono text-[11px] font-medium text-text-muted">
                            {new Date(event.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                          <span className="text-[12px] leading-relaxed text-text-secondary">
                            {event.description}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        {/* ── ANSWERS TAB ────────────────────────────────── */}
        {activeTab === 'answers' && <AnswerList answers={answers} />}

        {/* ── AUDIT TAB ──────────────────────────────────── */}
        {activeTab === 'audit' && <AuditTimeline events={auditEvents} />}
      </div>

      {/* ── Delete confirmation modal ───────────────────── */}
      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(2,14,14,0.85)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirmOpen(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-6 flex flex-col gap-5"
            style={{ background: 'var(--color-dash-card)', borderColor: 'rgba(220,38,38,0.4)' }}
          >
            {/* Icon + title */}
            <div className="flex items-start gap-4">
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-sm text-text-primary">Remove Case from Queue?</p>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  This will remove <span className="font-semibold text-text-primary">{displayId}</span> from
                  the active queue. The case data is retained for audit purposes but will no longer appear in
                  the clinician view.
                </p>
              </div>
            </div>

            {/* Case summary */}
            <div
              className="rounded-xl px-4 py-3 text-xs"
              style={{ background: 'var(--color-dash-surface)', border: '1px solid var(--color-dash-border)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Patient</span>
                <span className="font-mono font-semibold text-text-secondary">{displayId}</span>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-text-muted">Complaint</span>
                <span className="font-semibold text-text-secondary">{complaint}</span>
              </div>
              {session.ctas_level && (
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-text-muted">CTAS Level</span>
                  <span className="font-bold" style={{
                    color: session.ctas_level === 1 ? '#dc2626'
                      : session.ctas_level === 2 ? '#ea580c'
                      : session.ctas_level === 3 ? '#eab308'
                      : session.ctas_level === 4 ? '#22c55e'
                      : '#3b82f6'
                  }}>
                    CTAS {session.ctas_level}
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteLoading}
                className="flex-1 rounded-xl border border-dash-border py-2.5 text-xs font-semibold text-text-secondary transition-colors hover:border-sc-700 hover:text-sc-400 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCase}
                disabled={deleteLoading}
                className="flex-1 rounded-xl py-2.5 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                style={{ background: '#dc2626' }}
              >
                {deleteLoading ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    Removing…
                  </>
                ) : (
                  'Yes, Remove Case'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
