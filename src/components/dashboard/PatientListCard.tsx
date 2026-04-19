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
    : 'border-l-dash-border';

  return (
    <button
      onClick={onClick}
      className={`
        block w-full rounded-[10px] border border-l-[3px] p-3 text-left
        transition-all duration-150
        ${accentClass}
        ${
          selected
            ? 'border-sc-500 bg-dash-raised'
            : 'border-dash-border/60 bg-dash-card hover:bg-dash-raised/60'
        }
      `}
    >
      {/* Row 1: CTAS badge + Patient ID */}
      <div className="mb-1.5 flex items-center justify-between">
        {session.ctas_level ? (
          <CTASBadge level={session.ctas_level} size="sm" />
        ) : (
          <span className="rounded-full bg-dash-border/50 px-2 py-0.5 text-[10px] font-bold text-text-muted">
            PENDING
          </span>
        )}
        <span className="font-mono text-[11px] font-medium text-text-muted">
          {patientDisplayId(session)}
        </span>
      </div>

      {/* Row 2: Complaint */}
      <p className="mb-2 line-clamp-2 text-[13px] font-semibold leading-snug text-text-primary">
        {complaint}
      </p>

      {/* Row 3: Time + Priority */}
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[11px] text-text-muted">
          <span className="text-xs">⏱</span> {timeAgo(session.created_at)}
        </span>
        <span className="font-mono text-[11px] text-text-muted">
          Priority: {score}/100
        </span>
      </div>

      {/* Row 4: Status pill */}
      <div className="flex items-center gap-1.5">
        <span className={`text-[10px] ${pill.color}`}>{pill.icon}</span>
        <span className={`text-[11px] font-medium ${pill.color}`}>
          {pill.text}
        </span>
      </div>
    </button>
  );
}
