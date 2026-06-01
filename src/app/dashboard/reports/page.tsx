'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { useDashboardStore } from '@/store/dashboard';
import type { DashboardMetrics, MetricsTimeseries } from '@/types/api';

const CTAS_COLORS: Record<string, string> = {
  '1': '#dc2626', '2': '#ea580c', '3': '#ca8a04', '4': '#16a34a', '5': '#2563eb',
};
const CTAS_LABELS: Record<string, string> = {
  '1': 'Resuscitation', '2': 'Emergent', '3': 'Urgent', '4': 'Less Urgent', '5': 'Non-Urgent',
};

function KpiCard({ label, value, sub, accent = '#09f6ee' }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: 'rgb(11,40,39)', border: '1px solid rgba(21,81,80,0.6)',
      borderRadius: 16, padding: '20px 24px', flex: 1, minWidth: 140,
    }}>
      <p style={{ color: 'rgba(93,213,211,0.6)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>{label}</p>
      <p style={{ color: accent, fontSize: 28, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ color: 'rgba(93,213,211,0.4)', fontSize: 11, marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p style={{ color: 'rgba(9,246,238,0.5)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 16 }}>
      {title}
    </p>
  );
}

export default function ReportsPage() {
  const { emergencyAlert } = useDashboardStore();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [timeseries, setTimeseries] = useState<MetricsTimeseries | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getMetrics(),
      api.getMetricsTimeseries(days),
    ]).then(([m, t]) => {
      setMetrics(m.data);
      setTimeseries(t.data);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.getMetricsTimeseries(days).then(r => setTimeseries(r.data)).catch(() => {});
  }, [days]);

  const totalSessions = metrics?.total_sessions ?? 0;
  const ctasDist = metrics?.ctas_distribution ?? {};
  const specialtyDist = metrics?.specialty_distribution ?? {};
  const maxCtasCount = Math.max(...Object.values(ctasDist), 1);
  const maxSpecCount = Math.max(...Object.values(specialtyDist), 1);
  const maxDaily = Math.max(...(timeseries?.daily_sessions.map(d => d.count) ?? [1]), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'rgb(5,20,20)' }}>
      <DashboardNav activeBoothCount={0} hasAlert={!!emergencyAlert} />

      <main style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        {/* Title + time selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ color: '#e0fffe', fontSize: 24, fontWeight: 900, fontFamily: 'monospace', letterSpacing: '-0.03em' }}>
              System Reports
            </h1>
            <p style={{ color: 'rgba(93,213,211,0.5)', fontSize: 13, marginTop: 4 }}>
              Overall triage performance metrics
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)} style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: days === d ? '1px solid rgba(9,246,238,0.5)' : '1px solid rgba(21,81,80,0.5)',
                background: days === d ? 'rgba(9,246,238,0.1)' : 'transparent',
                color: days === d ? '#09f6ee' : 'rgba(93,213,211,0.5)',
              }}>{d}d</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <p style={{ color: 'rgba(93,213,211,0.4)', fontFamily: 'monospace' }}>Loading metrics…</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

            {/* KPI row */}
            <div>
              <SectionHeader title="Key Performance Indicators" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <KpiCard label="Total Sessions" value={String(totalSessions)} sub="all time" />
                <KpiCard
                  label="Avg Triage Time"
                  value={metrics?.avg_triage_time_minutes != null ? `${metrics.avg_triage_time_minutes}m` : '—'}
                  sub="arrival → CTAS"
                  accent="#36c9c5"
                />
                <KpiCard
                  label="Avg Wait Time"
                  value={metrics?.avg_wait_time_minutes != null ? `${metrics.avg_wait_time_minutes}m` : '—'}
                  sub="CTAS → seen"
                  accent="#5dd5d3"
                />
                <KpiCard
                  label="Red Flag Rate"
                  value={`${((metrics?.red_flag_rate ?? 0) * 100).toFixed(1)}%`}
                  sub={`${Math.round((metrics?.red_flag_rate ?? 0) * totalSessions)} patients`}
                  accent="#f87171"
                />
                <KpiCard
                  label="Escalation Rate"
                  value={`${((metrics?.escalation_rate ?? 0) * 100).toFixed(1)}%`}
                  sub={`${metrics?.escalation_count ?? 0} overrides`}
                  accent="#fb923c"
                />
              </div>
            </div>

            {/* Patient volume chart */}
            {timeseries && timeseries.daily_sessions.length > 0 && (
              <div style={{ background: 'rgb(11,40,39)', border: '1px solid rgba(21,81,80,0.6)', borderRadius: 16, padding: '24px' }}>
                <SectionHeader title={`Patient Volume — Last ${days} Days (${timeseries.total_in_period} total)`} />
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, paddingBottom: 4 }}>
                  {timeseries.daily_sessions.map((d) => {
                    const h = Math.max(4, Math.round((d.count / maxDaily) * 110));
                    return (
                      <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'rgba(9,246,238,0.5)', fontSize: 9, fontFamily: 'monospace' }}>{d.count || ''}</span>
                        <div style={{ width: '100%', height: h, borderRadius: '3px 3px 0 0', background: 'linear-gradient(to top, #36c9c5, #09f6ee)', minHeight: 4 }} />
                        <span style={{ color: 'rgba(93,213,211,0.35)', fontSize: 8, fontFamily: 'monospace' }}>
                          {d.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CTAS distribution */}
            <div style={{ background: 'rgb(11,40,39)', border: '1px solid rgba(21,81,80,0.6)', borderRadius: 16, padding: '24px' }}>
              <SectionHeader title="CTAS Distribution" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1, 2, 3, 4, 5].map(level => {
                  const count = ctasDist[String(level)] ?? 0;
                  const pct = totalSessions > 0 ? (count / totalSessions * 100).toFixed(1) : '0.0';
                  const barW = maxCtasCount > 0 ? Math.max(2, (count / maxCtasCount) * 100) : 0;
                  return (
                    <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 100, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: CTAS_COLORS[String(level)] }}>
                          CTAS {level}
                        </span>
                        <br />
                        <span style={{ fontSize: 9, color: 'rgba(93,213,211,0.4)' }}>{CTAS_LABELS[String(level)]}</span>
                      </div>
                      <div style={{ flex: 1, background: 'rgba(21,81,80,0.3)', borderRadius: 4, height: 24, overflow: 'hidden' }}>
                        <div style={{ width: `${barW}%`, height: '100%', background: CTAS_COLORS[String(level)], borderRadius: 4, transition: 'width 0.4s ease', opacity: count ? 1 : 0.2 }} />
                      </div>
                      <span style={{ width: 60, textAlign: 'right', color: CTAS_COLORS[String(level)], fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>
                        {count} <span style={{ color: 'rgba(93,213,211,0.4)', fontSize: 10 }}>({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Specialty distribution */}
            {Object.keys(specialtyDist).length > 0 && (
              <div style={{ background: 'rgb(11,40,39)', border: '1px solid rgba(21,81,80,0.6)', borderRadius: 16, padding: '24px' }}>
                <SectionHeader title="Specialty Routing" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(specialtyDist).sort((a, b) => b[1] - a[1]).map(([spec, count]) => {
                    const pct = totalSessions > 0 ? (count / totalSessions * 100).toFixed(1) : '0.0';
                    const barW = Math.max(2, (count / maxSpecCount) * 100);
                    return (
                      <div key={spec} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 140, flexShrink: 0, color: '#e0fffe', fontSize: 12, fontWeight: 600 }}>{spec}</span>
                        <div style={{ flex: 1, background: 'rgba(21,81,80,0.3)', borderRadius: 4, height: 20, overflow: 'hidden' }}>
                          <div style={{ width: `${barW}%`, height: '100%', background: 'linear-gradient(90deg, #36c9c5, #09f6ee)', borderRadius: 4 }} />
                        </div>
                        <span style={{ width: 60, textAlign: 'right', color: '#09f6ee', fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
                          {count} <span style={{ color: 'rgba(93,213,211,0.4)', fontSize: 10 }}>({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
