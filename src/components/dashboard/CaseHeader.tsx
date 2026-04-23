'use client';

import type { TriageSession } from '@/types/api';
import { patientDisplayId } from '@/lib/dashboard-utils';
import { CTASBadge } from './CTASBadge';
import { useTransitionRouter } from '@/hooks/useTransitionRouter';

interface CaseHeaderProps {
  session: TriageSession;
  complaint: string | undefined;
}

export function CaseHeader({ session, complaint }: CaseHeaderProps) {
  const { navigate } = useTransitionRouter();
  const flags = session.red_flags ?? [];
  const routingLabel = flags.some((f) => /cardiac|heart/i.test(f))
    ? 'Cardiac Emergency'
    : 'Clinical Review';

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-dash-border bg-dash-surface px-6 py-3.5">
      {/* Patient ID */}
      <span className="font-mono text-[13px] font-medium text-text-muted">
        {patientDisplayId(session)}
      </span>

      {/* CTAS badge */}
      {session.ctas_level && (
        <CTASBadge level={session.ctas_level} size="sm" variant="outline" />
      )}

      {/* Chief complaint */}
      {complaint && (
        <span className="text-base font-bold text-text-primary">
          {complaint}
        </span>
      )}

      {/* Routing label */}
      {flags.length > 0 && (
        <>
          <span className="text-text-dim">→</span>
          <span className="text-[13px] text-text-muted">{routingLabel}</span>
        </>
      )}

      {/* Expand button — right-aligned */}
      <div className="ml-auto">
        <button
          onClick={() => navigate(`/dashboard/cases/${session.id}`, 'forward')}
          className="flex items-center gap-1.5 rounded-lg border border-dash-border bg-transparent px-3.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-sc-500 hover:text-sc-400"
        >
          <span className="text-xs">⤢</span> Expand
        </button>
      </div>
    </div>
  );
}
