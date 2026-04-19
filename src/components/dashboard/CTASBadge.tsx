const CTAS_LABELS: Record<number, string> = {
  1: 'Resuscitation',
  2: 'Emergent',
  3: 'Urgent',
  4: 'Less Urgent',
  5: 'Non-Urgent',
};

/*
 * Tailwind v4 class maps for each CTAS level.
 * Using brand `ctas-*` tokens defined in globals.css @theme.
 * Levels 1–2 use solid backgrounds; 3–5 use transparent tinted backgrounds.
 */
const CTAS_CLASSES: Record<number, { wrapper: string; dot: string }> = {
  1: {
    wrapper: 'bg-ctas-1/90 text-white border-ctas-1',
    dot: 'bg-white',
  },
  2: {
    wrapper: 'bg-ctas-2/90 text-white border-ctas-2',
    dot: 'bg-white',
  },
  3: {
    wrapper: 'bg-ctas-3/25 text-ctas-3 border-ctas-3',
    dot: '',
  },
  4: {
    wrapper: 'bg-ctas-4/25 text-ctas-4 border-ctas-4',
    dot: '',
  },
  5: {
    wrapper: 'bg-ctas-5/25 text-ctas-5 border-ctas-5',
    dot: '',
  },
};

const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-[3px] text-[11px]',
  lg: 'px-4 py-1.5 text-sm',
} as const;

interface CTASBadgeProps {
  level: 1 | 2 | 3 | 4 | 5;
  size?: 'sm' | 'md' | 'lg';
}

export function CTASBadge({ level, size = 'md' }: CTASBadgeProps) {
  const c = CTAS_CLASSES[level];
  const sizeClass = SIZE_CLASSES[size];

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-bold tracking-wide leading-snug ${c.wrapper} ${sizeClass}`}
    >
      {/* Pulsing dot for critical levels 1–2 */}
      {level <= 2 && (
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`}
        />
      )}
      CTAS {level} — {CTAS_LABELS[level]}
    </span>
  );
}
