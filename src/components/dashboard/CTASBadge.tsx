const CTAS_LABELS: Record<number, string> = {
  1: 'Resuscitation',
  2: 'Emergent',
  3: 'Urgent',
  4: 'Less Urgent',
  5: 'Non-Urgent',
};

const CTAS_CLASSES: Record<
  number,
  { solid: string; outline: string; dotSolid: string; dotOutline: string }
> = {
  1: {
    solid: 'bg-ctas-1/90 text-white border-ctas-1',
    outline: 'bg-ctas-1/10 text-ctas-1 border-ctas-1',
    dotSolid: 'bg-white',
    dotOutline: 'bg-ctas-1',
  },
  2: {
    solid: 'bg-ctas-2/90 text-white border-ctas-2',
    outline: 'bg-ctas-2/10 text-ctas-2 border-ctas-2',
    dotSolid: 'bg-white',
    dotOutline: 'bg-ctas-2',
  },
  3: {
    solid: 'bg-ctas-3/25 text-ctas-3 border-ctas-3',
    outline: 'bg-ctas-3/10 text-ctas-3 border-ctas-3',
    dotSolid: 'bg-ctas-3',
    dotOutline: 'bg-ctas-3',
  },
  4: {
    solid: 'bg-ctas-4/25 text-ctas-4 border-ctas-4',
    outline: 'bg-ctas-4/10 text-ctas-4 border-ctas-4',
    dotSolid: 'bg-ctas-4',
    dotOutline: 'bg-ctas-4',
  },
  5: {
    solid: 'bg-ctas-5/25 text-ctas-5 border-ctas-5',
    outline: 'bg-ctas-5/10 text-ctas-5 border-ctas-5',
    dotSolid: 'bg-ctas-5',
    dotOutline: 'bg-ctas-5',
  },
};

const SIZE_CLASSES = {
  sm: 'px-2 py-[2px] text-[11px]',
  md: 'px-2.5 py-[3px] text-xs',
  lg: 'px-4 py-1.5 text-sm',
} as const;

interface CTASBadgeProps {
  level: 1 | 2 | 3 | 4 | 5;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'solid' | 'outline';
  shortLabel?: boolean;
}

export function CTASBadge({
  level,
  size = 'md',
  variant = 'solid',
  shortLabel = false,
}: CTASBadgeProps) {
  const c = CTAS_CLASSES[level];
  const sizeClass = SIZE_CLASSES[size];
  const wrapperClass = variant === 'solid' ? c.solid : c.outline;
  const dotClass = variant === 'solid' ? c.dotSolid : c.dotOutline;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-bold leading-snug tracking-wide ${wrapperClass} ${sizeClass}`}
    >
      {/* Pulsing element for high urgency (hidden on outline variant if you want it cleaner, but we'll adapt dot) */}
      {variant === 'solid' && level <= 2 && (
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full animate-pulse ${dotClass}`}
        />
      )}
      {shortLabel ? `CTAS ${level}` : `CTAS ${level} — ${CTAS_LABELS[level]}`}
    </span>
  );
}

