interface Props {
  label: string;
  icon: string;
  value: string;
  unit: string;
  classification: string;
  tone: 'green' | 'amber' | 'orange' | 'red' | 'muted';
  /** 0–100 position on the reference band. null hides the bar. */
  fillPct: number | null;
  refLabel?: string;
}

const TONE: Record<Props['tone'], { fg: string; bg: string; bar: string; barTrack: string }> = {
  green: { fg: '#22c55e', bg: 'rgba(34,197,94,0.15)', bar: '#22c55e', barTrack: '#0b2827' },
  amber: { fg: '#eab308', bg: 'rgba(234,179,8,0.15)', bar: '#eab308', barTrack: '#0b2827' },
  orange: { fg: '#ea580c', bg: 'rgba(234,88,12,0.15)', bar: '#ea580c', barTrack: '#0b2827' },
  red: { fg: '#dc2626', bg: 'rgba(220,38,38,0.15)', bar: '#dc2626', barTrack: '#0b2827' },
  muted: { fg: '#2aa2a0', bg: 'rgba(21,81,80,0.3)', bar: '#155150', barTrack: '#0b2827' },
};

export function VitalCard({ label, icon, value, unit, classification, tone, fillPct, refLabel }: Props) {
  const t = TONE[tone];
  return (
    <div
      style={{
        backgroundColor: '#0b2827',
        border: '1px solid #155150',
        borderRadius: 12,
        padding: '20px 24px',
      }}
    >
      {/* Header: icon + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 16, color: '#36c9c5' }}>{icon}</span>
        <span
          style={{
            color: '#36c9c5',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>

      {/* Value + unit */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 36,
            fontWeight: 700,
            color: '#f0fffe',
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ color: '#2aa2a0', fontSize: 14, fontWeight: 500 }}>
            {unit}
          </span>
        )}
      </div>

      {/* Classification badge */}
      <div style={{ marginBottom: 16 }}>
        <span
          style={{
            backgroundColor: t.bg,
            color: t.fg,
            border: `1px solid ${t.fg}`,
            padding: '3px 10px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {classification}
        </span>
      </div>

      {/* Progress bar */}
      {fillPct !== null && (
        <div
          style={{
            height: 4,
            backgroundColor: t.barTrack,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.max(2, Math.min(100, fillPct))}%`,
              height: '100%',
              backgroundColor: t.bar,
              borderRadius: 2,
              transition: 'width 0.6s ease',
            }}
          />
        </div>
      )}

      {refLabel && (
        <p style={{ color: '#155150', fontSize: 10, marginTop: 8 }}>{refLabel}</p>
      )}
    </div>
  );
}
