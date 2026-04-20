import React from 'react';

interface Props {
  label: string;
  icon: React.ReactNode;
  value: string | React.ReactNode;
  unit: string;
  classification: string;
  tone: 'green' | 'amber' | 'orange' | 'red' | 'muted';
  /** 0–100 position on the reference band. null hides the bar. */
  fillPct: number | null;
  refLabel?: string;
}

const TONE_CLASSES: Record<Props['tone'], { badge: string; bar: string; border: string }> = {
  green: { badge: 'border-success text-success', bar: 'bg-success', border: 'border-l-success' },
  amber: { badge: 'border-warning text-warning', bar: 'bg-warning', border: 'border-l-warning' },
  orange: { badge: 'border-orange-600 text-orange-500', bar: 'bg-orange-500', border: 'border-l-orange-500' },
  red: { badge: 'border-danger text-danger', bar: 'bg-danger', border: 'border-l-danger' },
  muted: { badge: 'border-dash-border text-dash-border', bar: 'bg-dash-border', border: 'border-l-dash-border' },
};

export function VitalCard({ label, icon, value, unit, classification, tone, fillPct, refLabel }: Props) {
  const t = TONE_CLASSES[tone];
  
  // Custom render for unpopulated missing data matching figma
  const displayValue = value === '—' ? (
    <div className="h-[4px] w-6 rounded-full bg-white relative top-2.5"></div>
  ) : (
    value
  );

  return (
    <div className={`flex flex-col justify-between overflow-hidden rounded-xl border border-dash-border border-l-[4px] bg-dash-card p-5 lg:px-6 ${t.border}`}>
      <div>
        {/* Header: icon + label */}
        <div className="mb-4 flex items-center gap-2">
          <span className="flex items-center justify-center h-5 w-5">{icon}</span>
          <span className="text-[13px] uppercase tracking-[0.08em] text-sc-500">
            {label}
          </span>
        </div>

        {/* Value + unit */}
        <div className="mb-6 flex items-baseline gap-2 min-h-[36px]">
          <span className="font-mono text-[36px] font-bold leading-none text-text-primary">
            {displayValue}
          </span>
          {unit && (
            <span className="text-sm font-medium text-text-muted">
              {unit}
            </span>
          )}
        </div>
      </div>

      <div>
        {/* Classification badge */}
        <div className="mb-4 flex">
          {classification === '—' ? (
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border bg-transparent ${t.badge}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </span>
          ) : (
            <span className={`rounded-full border px-3 py-[3px] text-xs font-semibold bg-transparent ${t.badge}`}>
              {classification}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {fillPct !== null && (
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-dash-bg">
            <div
              className={`h-full rounded-full transition-all duration-500 ${t.bar}`}
              style={{ width: `${Math.max(2, Math.min(100, fillPct))}%` }}
            />
          </div>
        )}

        {refLabel && (
          <p className="mt-2 text-[10px] text-dash-border">
            {refLabel}
          </p>
        )}
      </div>
    </div>
  );
}


