const CTAS_LABELS: Record<number, string> = {
  1: 'Resuscitation',
  2: 'Emergent',
  3: 'Urgent',
  4: 'Less Urgent',
  5: 'Non-Urgent',
};

const CTAS_COLORS: Record<number, string> = {
  1: '#dc2626',
  2: '#ea580c',
  3: '#ca8a04',
  4: '#16a34a',
  5: '#2563eb',
};

interface CTASBadgeProps {
  level: 1 | 2 | 3 | 4 | 5;
  size?: 'sm' | 'md' | 'lg';
}

export function CTASBadge({ level, size = 'md' }: CTASBadgeProps) {
  const padding = size === 'lg' ? '8px 20px' : size === 'sm' ? '2px 8px' : '4px 12px';
  const fontSize = size === 'lg' ? 18 : size === 'sm' ? 11 : 13;

  return (
    <span
      style={{
        backgroundColor: CTAS_COLORS[level],
        color: '#fff',
        padding,
        borderRadius: 9999,
        fontSize,
        fontWeight: 700,
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      CTAS {level} · {CTAS_LABELS[level]}
    </span>
  );
}
