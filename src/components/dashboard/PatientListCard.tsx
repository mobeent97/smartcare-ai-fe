import type { TriageSession } from '@/types/api';
import { CTASBadge } from './CTASBadge';
import {
  patientDisplayId,
  patientDemographicsLabel,
  priorityScore,
  timeAgo,
  statusPill,
  firstComplaint,
} from '@/lib/dashboard-utils';

export { patientDisplayId, priorityScore };

const PILL_COLORS: Record<string, string> = {
  'text-danger': 'rgb(220, 38, 38)',
  'text-success': 'rgb(34, 197, 94)',
  'text-sc-500': 'rgb(93, 213, 211)',
};

interface Props {
  session: TriageSession;
  selected: boolean;
  onClick: () => void;
}

export function PatientListCard({ session, selected, onClick }: Props) {
  const pill = statusPill(session);
  const complaint = firstComplaint(session);
  const score = priorityScore(session);
  const isUrgent = session.ctas_level === 1;
  const demographics = patientDemographicsLabel(session);

  const border = selected
    ? '1px solid rgb(54, 201, 197)'
    : isUrgent
      ? '1px solid rgb(220, 38, 38)'
      : '1px solid rgb(21, 81, 79)';

  const background = selected ? 'rgb(13, 54, 53)' : 'rgb(11, 40, 39)';

  return (
    <button
      onClick={onClick}
      className={isUrgent && !selected ? 'ctas-pulse' : ''}
      style={{
        background,
        border,
        borderRadius: '10px',
        padding: '12px 14px',
        cursor: 'pointer',
        transition: '0.2s',
        position: 'relative',
        width: '100%',
        textAlign: 'left',
        display: 'block',
      }}
    >
      {/* Row 1: CTAS badge + Patient name/ID */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5px' }}>
        {session.ctas_level ? (
          <CTASBadge level={session.ctas_level} size="sm" variant="outline" shortLabel />
        ) : (
          <span style={{ borderRadius: '9999px', border: '1px solid rgba(93,213,211,0.3)', padding: '2px 8px', fontSize: '10px', fontWeight: 700, color: 'rgb(93,213,211)' }}>
            PENDING
          </span>
        )}
        <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'rgb(93, 213, 211)', fontSize: '11px' }}>
          {patientDisplayId(session)}
        </span>
      </div>

      {/* Row 2: Demographics (age · sex) */}
      {demographics && (
        <div style={{ marginBottom: '5px' }}>
          <span style={{ color: 'rgba(93,213,211,0.65)', fontSize: '11px', fontFamily: 'monospace' }}>
            {demographics}
          </span>
        </div>
      )}

      {/* Row 3: Complaint */}
      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: 'rgb(240, 255, 254)', fontSize: '14px', fontWeight: 600 }}>
          {complaint}
        </span>
      </div>

      {/* Row 3: Time + Priority */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgb(93,213,211)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <span style={{ color: 'rgb(93, 213, 211)', fontSize: '12px' }}>
            {timeAgo(session.created_at)}
          </span>
        </div>
        <span style={{ color: 'rgb(93, 213, 211)', fontSize: '11px', fontWeight: 600 }}>
          Priority: {score}/100
        </span>
      </div>

      {/* Row 4: Specialty + escalated flag + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '12px' }}>{pill.icon}</span>
          <span style={{ fontSize: '12px', fontWeight: 500, color: PILL_COLORS[pill.color] ?? 'rgb(93,213,211)' }}>
            {pill.text}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {session.escalated && (
            <span style={{
              fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '9999px',
              background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.4)',
              color: '#fb923c', letterSpacing: '0.04em',
            }}>
              ↑ ESC
            </span>
          )}
          {session.routing_specialty && (
            <span style={{
              fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '9999px',
              background: 'rgba(9,246,238,0.08)', border: '1px solid rgba(9,246,238,0.2)',
              color: 'rgba(9,246,238,0.7)',
            }}>
              {session.routing_specialty}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
