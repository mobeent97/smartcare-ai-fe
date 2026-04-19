import type { TriageSession } from '@/types/api';
import { CTASBadge } from './CTASBadge';

interface Props {
  session: TriageSession;
  selected: boolean;
  onClick: () => void;
}

const CTAS_ACCENT: Record<number, string> = {
  1: '#dc2626',
  2: '#ea580c',
  3: '#eab308',
  4: '#22c55e',
  5: '#3b82f6',
};

export function patientDisplayId(session: TriageSession): string {
  const year = new Date(session.created_at).getFullYear();
  return `P-${year}-${session.id.slice(-4).toUpperCase()}`;
}

export function priorityScore(session: TriageSession): number {
  const base = session.ctas_level ? (6 - session.ctas_level) * 18 : 40;
  const flagBoost = ((session.red_flags ?? []).length) * 4;
  return Math.min(99, base + flagBoost);
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
}

function statusPill(session: TriageSession): { text: string; icon: string; color: string } {
  const flags = session.red_flags ?? [];
  if (flags.length > 0) {
    return { text: 'Red Flag', icon: '●', color: '#dc2626' };
  }
  if (session.status === 'COMPLETED') {
    return { text: 'Routed', icon: '✓', color: '#22c55e' };
  }
  if (session.ctas_level) {
    return { text: 'In Assessment', icon: '▪', color: '#eab308' };
  }
  return { text: 'Waiting', icon: '◷', color: '#2aa2a0' };
}

function firstComplaint(session: TriageSession): string {
  const answers = session.answers ?? [];
  const complaint = answers.find((a) => a.step_name === 'complaint');
  if (complaint) return complaint.raw_input;
  const flags = session.red_flags ?? [];
  if (flags.length) return flags[0];
  return 'Pending intake';
}

export function PatientListCard({ session, selected, onClick }: Props) {
  const pill = statusPill(session);
  const complaint = firstComplaint(session);
  const score = priorityScore(session);
  const accent = session.ctas_level ? CTAS_ACCENT[session.ctas_level] : '#155150';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        borderRadius: 10,
        padding: '12px 14px',
        backgroundColor: selected ? '#0d3635' : '#0b2827',
        border: selected ? '1px solid #36c9c5' : '1px solid rgba(21,81,80,0.6)',
        borderLeft: `3px solid ${accent}`,
        transition: 'all 0.15s ease',
        minHeight: 'auto',
      }}
    >
      {/* Row 1: CTAS badge + Patient ID */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {session.ctas_level ? (
          <CTASBadge level={session.ctas_level} size="sm" />
        ) : (
          <span
            style={{
              backgroundColor: 'rgba(21,81,80,0.5)',
              color: '#2aa2a0',
              padding: '2px 8px',
              borderRadius: 9999,
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            PENDING
          </span>
        )}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            color: '#2aa2a0',
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          {patientDisplayId(session)}
        </span>
      </div>

      {/* Row 2: Complaint */}
      <p
        style={{
          color: '#f0fffe',
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.3,
          marginBottom: 8,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {complaint}
      </p>

      {/* Row 3: Time + Priority */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: '#2aa2a0', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12 }}>⏱</span> {timeAgo(session.created_at)}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            color: '#2aa2a0',
            fontSize: 11,
          }}
        >
          Priority: {score}/100
        </span>
      </div>

      {/* Row 4: Status pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: pill.color, fontSize: 10 }}>{pill.icon}</span>
        <span style={{ color: pill.color, fontSize: 11, fontWeight: 500 }}>{pill.text}</span>
      </div>
    </button>
  );
}
