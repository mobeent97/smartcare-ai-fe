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

// Re-export utilities so existing consumers don't break during migration
export { patientDisplayId, priorityScore };

interface Props {
  session: TriageSession;
  selected: boolean;
  onClick: () => void;
}

export function PatientListCard({ session, selected, onClick }: Props) {
  const pill = statusPill(session);
  const complaint = firstComplaint(session);
  const score = priorityScore(session);
  const accentClass = session.ctas_level
    ? CTAS_ACCENT_CLASS[session.ctas_level]
    : 'border-dash-border';

  return (
    <button
      onClick={onClick}
      className={`
        block w-full rounded-[10px] border-[1px] border-l-[4px] p-3.5 text-left
        transition-all duration-150
        ${accentClass}
        ${
          selected
            ? 'bg-[#0a1e1d]' // Darker specific raised bg seen in screenshot
            : 'bg-[#051414] hover:bg-[#0a1e1d]/60'
        }
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
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          {timeAgo(session.created_at)}
        </span>
        <span className="font-sans text-[11px] font-bold text-sc-400 tracking-wide">
          Priority: {score}/100
        </span>
      </div>

      {/* Row 4: Status pill */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] leading-none">{pill.icon}</span>
        <span className={`text-[12px] font-medium ${pill.color}`}>
          {pill.text}
        </span>
      </div>
    </button>
  );
}
