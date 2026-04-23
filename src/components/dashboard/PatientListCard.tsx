'use client';

import { useState } from 'react';
import type { TriageSession } from '@/types/api';
import { CTASBadge } from './CTASBadge';
import {
  patientDisplayId,
  priorityScore,
  timeAgo,
  statusPill,
  firstComplaint,
  CTAS_ACCENT_CLASS,
} from '@/lib/dashboard-utils';
import { api } from '@/lib/api';
import { useDashboardStore } from '@/store/dashboard';

export { patientDisplayId, priorityScore };

interface Props {
  session: TriageSession;
  selected: boolean;
  onClick: () => void;
}

export function PatientListCard({ session, selected, onClick }: Props) {
  const { updateQueueItem, removeFromQueue } = useDashboardStore();

  const [markLoading, setMarkLoading] = useState(false);
  const [deleteStage, setDeleteStage] = useState<'idle' | 'confirm' | 'loading'>('idle');

  const pill = statusPill(session);
  const complaint = firstComplaint(session);
  const score = priorityScore(session);
  const accentClass = session.ctas_level
    ? CTAS_ACCENT_CLASS[session.ctas_level]
    : 'border-dash-border';

  async function handleMarkSeen(e: React.MouseEvent) {
    e.stopPropagation();
    if (markLoading || session.status === 'COMPLETED') return;
    setMarkLoading(true);
    try {
      await api.executeAction(session.id, 'MARK_SEEN');
      updateQueueItem(session.id, { status: 'COMPLETED' });
    } catch { /* silent */ }
    setMarkLoading(false);
  }

  async function handleDeleteConfirm(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteStage('loading');
    try {
      await api.deleteCase(session.id);
      removeFromQueue(session.id);
    } catch {
      setDeleteStage('idle');
    }
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteStage('confirm');
  }

  function handleDeleteCancel(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteStage('idle');
  }

  const isCompleted = session.status === 'COMPLETED';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={`
        relative w-full rounded-[10px] border-[1px] border-l-[4px] p-3.5 text-left
        transition-all duration-150 cursor-pointer
        ${accentClass}
        ${selected ? 'bg-[#0a1e1d]' : 'bg-[#051414] hover:bg-[#0a1e1d]/60'}
      `}
    >
      {/* Row 1: CTAS badge + Patient ID */}
      <div className="mb-2 flex items-center justify-between">
        {session.ctas_level ? (
          <CTASBadge level={session.ctas_level} size="sm" variant="outline" shortLabel />
        ) : (
          <span className="rounded-full border border-dash-border/50 bg-dash-bg/50 px-2 py-0.5 text-[10px] font-bold text-text-muted">
            PENDING
          </span>
        )}
        <span className="font-mono text-[11px] font-semibold text-sc-400">
          {patientDisplayId(session)}
        </span>
      </div>

      {/* Row 2: Complaint */}
      <p className="mb-2.5 line-clamp-2 text-[15px] font-bold leading-snug text-white">
        {complaint}
      </p>

      {/* Row 3: Time + Priority */}
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-sc-400">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          {timeAgo(session.created_at)}
        </span>
        <span className="font-sans text-[11px] font-bold text-sc-400 tracking-wide">
          Priority: {score}/100
        </span>
      </div>

      {/* Row 4: Status pill */}
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-[11px] leading-none">{pill.icon}</span>
        <span className={`text-[12px] font-medium ${pill.color}`}>{pill.text}</span>
      </div>

      {/* Row 5: Action buttons */}
      {deleteStage === 'confirm' || deleteStage === 'loading' ? (
        /* ── Inline delete confirmation ── */
        <div
          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
          style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[11px] font-semibold text-danger leading-none">
            Remove patient?
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={handleDeleteCancel}
              disabled={deleteStage === 'loading'}
              className="rounded px-2 py-1 text-[10px] font-semibold text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={deleteStage === 'loading'}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ background: '#dc2626' }}
            >
              {deleteStage === 'loading' ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                  style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : null}
              Yes, Remove
            </button>
          </div>
        </div>
      ) : (
        /* ── Normal action buttons ── */
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {/* Mark Seen */}
          <button
            onClick={handleMarkSeen}
            disabled={markLoading || isCompleted}
            title={isCompleted ? 'Already marked seen' : 'Mark as seen'}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: isCompleted ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.06)',
              border: '1px solid rgba(34,197,94,0.25)',
              color: isCompleted ? '#22c55e' : '#4ade80',
            }}
          >
            {markLoading ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {isCompleted ? 'Seen' : 'Mark Seen'}
          </button>

          {/* Delete */}
          <button
            onClick={handleDeleteClick}
            title="Remove from queue"
            className="flex items-center justify-center rounded-lg p-1.5 transition-colors"
            style={{
              background: 'rgba(220,38,38,0.06)',
              border: '1px solid rgba(220,38,38,0.25)',
              color: '#f87171',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
