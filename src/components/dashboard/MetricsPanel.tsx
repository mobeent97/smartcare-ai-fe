'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { DashboardMetrics } from '@/types/api';

const CTAS_COLORS: Record<string, string> = {
  '1': '#dc2626', '2': '#ea580c', '3': '#ca8a04', '4': '#16a34a', '5': '#2563eb',
};

function KpiCard({
  label, value, sub, accent = '#09f6ee',
}: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl px-4 py-3"
      style={{ background: 'var(--color-dash-card)', border: '1px solid rgba(21,81,80,0.5)', minWidth: 120 }}
    >
      <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted">{label}</p>
      <p className="text-[22px] font-black leading-none" style={{ color: accent, fontFamily: 'monospace' }}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-text-dim">{sub}</p>}
    </div>
  );
}

export function MetricsPanel() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    api.getMetrics()
      .then((res) => setMetrics(res.data))
      .catch(() => {});
    // Refresh every 2 minutes
    const interval = setInterval(() => {
      api.getMetrics().then((res) => setMetrics(res.data)).catch(() => {});
    }, 120_000);
    return () => clearInterval(interval);
  }, []);

  const topSpecialty = metrics
    ? Object.entries(metrics.specialty_distribution).sort((a, b) => b[1] - a[1])[0]?.[0]
    : null;

  return (
    <div
      className="border-b border-dash-border/50"
      style={{ background: 'var(--color-dash-surface)' }}
    >
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-6 py-2.5 text-left transition-colors hover:bg-white/5"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#09f6ee" strokeWidth="2" strokeLinecap="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-sc-500">
          Live KPIs
        </span>
        {metrics && (
          <span className="ml-2 text-[10px] text-text-dim font-mono">
            {metrics.total_sessions} sessions
          </span>
        )}
        <span className="ml-auto text-[10px] text-text-dim">{open ? '▲' : '▼'}</span>
      </button>

      {open && metrics && (
        <div className="flex flex-wrap gap-3 overflow-x-auto px-6 pb-4 pt-1">

          {/* Time to triage */}
          <KpiCard
            label="Avg Triage Time"
            value={metrics.avg_triage_time_minutes != null ? `${metrics.avg_triage_time_minutes}m` : '—'}
            sub="arrival → CTAS assigned"
          />

          {/* Wait time */}
          <KpiCard
            label="Avg Wait Time"
            value={metrics.avg_wait_time_minutes != null ? `${metrics.avg_wait_time_minutes}m` : '—'}
            sub="CTAS assigned → seen"
            accent="#36c9c5"
          />

          {/* Red flag rate */}
          <KpiCard
            label="Red Flag Rate"
            value={`${(metrics.red_flag_rate * 100).toFixed(0)}%`}
            sub={`${Math.round(metrics.red_flag_rate * metrics.total_sessions)} patients`}
            accent="#f87171"
          />

          {/* Escalation rate */}
          <KpiCard
            label="Escalation Rate"
            value={`${(metrics.escalation_rate * 100).toFixed(0)}%`}
            sub={`${metrics.escalation_count} overrides`}
            accent="#fb923c"
          />

          {/* CTAS distribution */}
          <div
            className="flex flex-col gap-1.5 rounded-xl px-4 py-3"
            style={{ background: 'var(--color-dash-card)', border: '1px solid rgba(21,81,80,0.5)', minWidth: 160 }}
          >
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted">CTAS Distribution</p>
            <div className="flex items-end gap-1.5 h-8">
              {[1, 2, 3, 4, 5].map((level) => {
                const count = metrics.ctas_distribution[String(level)] ?? 0;
                const max = Math.max(...Object.values(metrics.ctas_distribution), 1);
                const heightPct = Math.max(8, Math.round((count / max) * 100));
                return (
                  <div key={level} className="flex flex-col items-center gap-0.5" style={{ flex: 1 }}>
                    <div
                      style={{
                        width: '100%',
                        height: `${heightPct}%`,
                        minHeight: 4,
                        borderRadius: 3,
                        background: CTAS_COLORS[String(level)],
                        opacity: count ? 1 : 0.2,
                      }}
                    />
                    <span style={{ fontSize: 8, color: CTAS_COLORS[String(level)], fontFamily: 'monospace', fontWeight: 700 }}>
                      {level}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top specialty */}
          {topSpecialty && (
            <KpiCard
              label="Top Specialty"
              value={topSpecialty.split('/')[0]}
              sub={`${metrics.specialty_distribution[topSpecialty]} patients`}
              accent="#a78bfa"
            />
          )}
        </div>
      )}
    </div>
  );
}
