const CTAS_LABELS: Record<number, string> = {
  1: 'Resuscitation',
  2: 'Emergent',
  3: 'Urgent',
  4: 'Less Urgent',
  5: 'Non-Urgent',
};

const CTAS_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  1: { bg: 'rgba(220,38,38,0.9)', border: '#dc2626', text: '#fff' },
  2: { bg: 'rgba(234,88,12,0.9)', border: '#ea580c', text: '#fff' },
  3: { bg: 'rgba(234,179,8,0.25)', border: '#eab308', text: '#eab308' },
  4: { bg: 'rgba(34,197,94,0.25)', border: '#22c55e', text: '#22c55e' },
  5: { bg: 'rgba(59,130,246,0.25)', border: '#3b82f6', text: '#93c5fd' },
};

interface CTASBadgeProps {
  level: 1 | 2 | 3 | 4 | 5;
  size?: 'sm' | 'md' | 'lg';
}

export function CTASBadge({ level, size = 'md' }: CTASBadgeProps) {
  const c = CTAS_COLORS[level];
  const isCompact = size === 'sm';
  const padding = size === 'lg' ? '6px 16px' : isCompact ? '2px 8px' : '3px 10px';
  const fontSize = size === 'lg' ? 14 : isCompact ? 10 : 11;

  return (
    <span
      style={{
        backgroundColor: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        padding,
        borderRadius: 9999,
        fontSize,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
        lineHeight: 1.4,
      }}
    >
      {level <= 2 && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: c.border,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
      )}
      CTAS {level} — {CTAS_LABELS[level]}
    </span>
  );
}
