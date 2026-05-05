'use client';

import type { TriageSession } from '@/types/api';
import { patientDisplayId, patientDemographicsLabel } from '@/lib/dashboard-utils';
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
  const demographics = patientDemographicsLabel(session);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-dash-border bg-dash-surface px-6 py-4">
      {/* Patient name or fallback ID */}
      <span className={session.patient_name ? 'text-[16px] font-bold text-text-primary' : 'font-mono text-[13px] font-medium text-text-muted'}>
        {patientDisplayId(session)}
      </span>

      {/* Age · Sex */}
      {demographics && (
        <span className="font-mono text-[12px] text-text-muted">
          {demographics}
        </span>
      )}

      {/* CTAS badge */}
      {session.ctas_level && (
        <CTASBadge level={session.ctas_level} size="sm" variant="outline" />
      )}

      {/* Chief complaint */}
      {complaint && (
        <span className="text-[15px] font-semibold text-text-primary">
          {complaint}
        </span>
      )}

      {/* Specialty routing */}
      {session.routing_specialty && (
        <span className="rounded-full border border-sc-700 bg-sc-900/30 px-2.5 py-0.5 text-[11px] font-semibold text-sc-400">
          {session.routing_specialty}
        </span>
      )}

      {/* Escalated badge */}
      {session.escalated && (
        <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-bold text-orange-400">
          ↑ Escalated
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
