'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useBoothStore } from '@/store/booth';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmergencyFab } from '@/components/booth/EmergencyFab';
import type { TriageSession } from '@/types/api';

/* ─── CTAS config ────────────────────────────────────────────── */
const CTAS_CONFIG: Record<number, { label: string; color: string; bg: string; border: string; glow: string }> = {
  1: { label: 'Resuscitation', color: '#fff',     bg: '#dc2626',              border: '#dc2626', glow: 'rgba(220,38,38,0.35)' },
  2: { label: 'Emergent',      color: '#fff',     bg: '#ea580c',              border: '#ea580c', glow: 'rgba(234,88,12,0.35)'  },
  3: { label: 'Urgent',        color: '#713f12',  bg: 'rgba(234,179,8,0.2)',  border: '#eab308', glow: 'rgba(234,179,8,0.25)'  },
  4: { label: 'Less Urgent',   color: '#14532d',  bg: 'rgba(34,197,94,0.18)', border: '#22c55e', glow: 'rgba(34,197,94,0.25)'  },
  5: { label: 'Non-Urgent',    color: '#1e3a8a',  bg: 'rgba(59,130,246,0.18)',border: '#3b82f6', glow: 'rgba(59,130,246,0.25)'  },
};

const PAIN_COLORS = ['#22c55e','#4ade80','#a3e635','#facc15','#fb923c','#f97316','#ef4444','#dc2626','#b91c1c','#991b1b'];
const PAIN_LABELS: Record<number, string> = {
  1:'Minimal', 2:'Very Mild', 3:'Mild', 4:'Mild-Moderate', 5:'Moderate',
  6:'Moderate-Severe', 7:'Severe', 8:'Very Severe', 9:'Extreme', 10:'Worst Possible',
};

/* ─── Routing derivation ─────────────────────────────────────── */
interface RouteInfo { destination: string; waitTime: string; areaCode: string }

function deriveRouting(ctas: number | null, complaint: string): RouteInfo {
  if (!ctas) return { destination: 'Triage Zone', waitTime: 'To be determined', areaCode: 'TBD' };
  const c = complaint.toLowerCase();
  if (ctas === 1) return { destination: 'Immediate ER / Resuscitation', waitTime: 'NOW — 0 minutes',         areaCode: 'ER-1'  };
  if (ctas === 2) {
    if (c.includes('chest') || c.includes('cardiac') || c.includes('heart'))
      return { destination: 'Cardiac Emergency',      waitTime: '< 15 minutes', areaCode: 'CE-2'  };
    if (c.includes('breath') || c.includes('respiratory') || c.includes('asthma'))
      return { destination: 'Respiratory Emergency',  waitTime: '< 15 minutes', areaCode: 'RE-2'  };
    if (c.includes('stroke') || c.includes('neuro') || c.includes('face') || c.includes('speech'))
      return { destination: 'Stroke / Neuro Emergency', waitTime: '< 15 minutes', areaCode: 'NE-2' };
    if (c.includes('trauma') || c.includes('injury') || c.includes('accident') || c.includes('fall'))
      return { destination: 'Trauma Bay',             waitTime: '< 15 minutes', areaCode: 'TB-2'  };
    if (c.includes('mental') || c.includes('anxiety') || c.includes('suicid') || c.includes('psych'))
      return { destination: 'Psychiatric Emergency',  waitTime: '< 30 minutes', areaCode: 'PE-2'  };
    return { destination: 'Monitored Area',           waitTime: '< 15 minutes', areaCode: 'MA-2'  };
  }
  if (ctas === 3) {
    if (c.includes('mental') || c.includes('anxiety') || c.includes('psych'))
      return { destination: 'Psychiatric Evaluation', waitTime: '< 30 minutes', areaCode: 'PE-3'  };
    return { destination: 'Monitored Area',           waitTime: '< 30 minutes', areaCode: 'MA-3'  };
  }
  if (ctas === 4) return { destination: 'Fast Track / Minor Care', waitTime: '< 60 minutes',  areaCode: 'FT-4' };
  return           { destination: 'General Clinic / Walk-in',      waitTime: '< 120 minutes', areaCode: 'GC-5' };
}

/* ─── Vitals extraction ──────────────────────────────────────── */
// Backend returns flat readings ({ systolic, diastolic, heart_rate, temperature, spo2 })
// but the TS type expects raw_readings nested. Support both.
function flatReadings(obj: unknown): Record<string, number | string> {
  if (!obj) return {};
  const m = obj as Record<string, unknown>;
  const nested = (m.raw_readings ?? {}) as Record<string, number | string>;
  return Object.keys(nested).length > 0 ? nested : m as Record<string, number | string>;
}

/* ─── Icons ──────────────────────────────────────────────────── */
const CheckCircleIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const LocationIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const ClockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const EcgLine = () => (
  <svg width="28" height="16" viewBox="0 0 32 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M0 9 H7 L9 2 L12 16 L15 5 L17 13 L19 9 H32"/>
  </svg>
);
const HeartIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);
const ThermometerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
  </svg>
);
const DropletIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
  </svg>
);
const LogOutIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

/* ─── Sub-components ─────────────────────────────────────────── */
function DataCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 border" style={{ background: 'var(--color-dash-card)', borderColor: 'rgba(21,81,80,0.55)' }}>
      <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      {children}
    </div>
  );
}

function VitalChip({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="flex-1 rounded-xl p-4 border text-center min-w-0"
      style={{ background: 'var(--color-dash-surface)', borderColor: `${color}30` }}>
      <div className="flex items-center justify-center gap-1 mb-2" style={{ color }}>
        {icon}
        <span className="text-xs font-mono uppercase tracking-wide">{label}</span>
      </div>
      <p className="font-black text-xl font-mono" style={{ color, fontFamily: 'monospace', letterSpacing: '-0.03em' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */
export default function TriageResultsPage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { measurementResult, reset } = useBoothStore();

  const [session, setSession] = useState<TriageSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSessionResults(sessionId)
      .then((res) => setSession(res.data))
      .catch(() => {/* show fallback */})
      .finally(() => setLoading(false));
  }, [sessionId]);

  function handleEndSession() {
    reset();
    router.push('/booth');
  }

  /* ── Derived data ── */
  const ctas = session?.ctas_level ?? null;
  const ctasCfg = ctas ? CTAS_CONFIG[ctas] : null;

  const complaintAnswer = session?.answers?.find((a) => a.step_name === 'complaint');
  const painAnswer      = session?.answers?.find((a) => a.step_name === 'symptom_detail');
  const complaint       = complaintAnswer?.raw_input ?? '';
  const painLevel       = painAnswer ? parseInt(painAnswer.raw_input, 10) : null;

  const route = deriveRouting(ctas, complaint);
  const queueNum = sessionId.slice(-4).toUpperCase();
  const specialty = session?.routing_specialty ?? null;

  const CTAS_EXPECT: Record<number, string> = {
    1: 'A nurse is coming to you RIGHT NOW. Do not move from your seat.',
    2: 'You will be seen within 15 minutes. Stay seated and alert staff immediately if symptoms worsen.',
    3: 'You will be seen within 30 minutes. Remain in the waiting area and notify staff of any changes.',
    4: 'You will be seen within 60 minutes. Stay comfortable and let reception know if you feel worse.',
    5: 'You will be seen within 2 hours. Feel free to sit — reception will call your name.',
  };
  const ctasExpect = ctas ? CTAS_EXPECT[ctas] : null;

  // Vitals — support both flat and nested raw_readings format
  const vitals = flatReadings(measurementResult);
  const systolic   = vitals.systolic   as number | undefined;
  const diastolic  = vitals.diastolic  as number | undefined;
  const heartRate  = vitals.heart_rate as number | undefined;
  const temperature = vitals.temperature as number | undefined;
  const spo2       = vitals.spo2       as number | undefined;
  const bpClass    = (measurementResult as unknown as Record<string, string>)?.classification;

  const hasVitals  = !!(systolic || temperature || spo2);
  const redFlags   = session?.red_flags?.filter(Boolean) ?? [];
  const hasRedFlags = redFlags.length > 0;

  const confidenceLabel = !ctas ? null
    : ctas <= 2 ? 'HIGH'
    : ctas === 3 ? 'MEDIUM'
    : 'STANDARD';

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5" style={{ background: 'var(--color-dash-bg)' }}>
        <LoadingSpinner size="lg" />
        <p className="text-sm font-mono" style={{ color: 'var(--color-text-secondary)' }}>Finalizing your assessment…</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes result-fade {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ctas-glow {
          0%, 100% { box-shadow: 0 0 0 0 ${ctasCfg?.glow ?? 'transparent'}; }
          50%       { box-shadow: 0 0 28px 8px ${ctasCfg?.glow ?? 'transparent'}; }
        }
        @keyframes queue-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.8; }
        }
        @keyframes check-draw {
          from { stroke-dashoffset: 80; }
          to   { stroke-dashoffset: 0; }
        }
        .r-fade   { animation: result-fade 0.5s ease both; }
        .r-fade-1 { animation: result-fade 0.5s 0.1s ease both; }
        .r-fade-2 { animation: result-fade 0.5s 0.2s ease both; }
        .r-fade-3 { animation: result-fade 0.5s 0.32s ease both; }
        .r-fade-4 { animation: result-fade 0.5s 0.44s ease both; }
        .r-fade-5 { animation: result-fade 0.5s 0.56s ease both; }
        .r-fade-6 { animation: result-fade 0.5s 0.68s ease both; }
        .end-btn {
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .end-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(9,246,238,0.2);
        }
        .end-btn:active { transform: translateY(0); }
      `}</style>

      <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-dash-bg)' }}>

        {/* ── Top bar ── */}
        <header className="sticky top-0 z-10 flex items-center justify-between px-6 h-14 border-b"
          style={{ background: 'rgba(5,20,20,0.95)', borderColor: 'rgba(21,81,80,0.4)', backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center gap-2">
            <span style={{ color: '#09f6ee' }}><EcgLine /></span>
            <span className="font-bold text-sm" style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
              SmartCare<span style={{ color: '#09f6ee' }}>AI</span>
            </span>
          </div>
          <span className="text-xs font-mono uppercase tracking-widest px-3 py-1 rounded-full"
            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
            Assessment Complete
          </span>
          <button onClick={handleEndSession}
            className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
            style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <LogOutIcon /> End
          </button>
        </header>

        {/* ── Scrollable content ── */}
        <main className="flex-1 overflow-y-auto px-5 py-7 flex flex-col gap-5 max-w-2xl mx-auto w-full">

          {/* ── Hero: checkmark + CTAS ── */}
          <div className="r-fade flex flex-col items-center text-center gap-4 py-4">
            <div style={{ color: '#22c55e' }} className="animate-pulse">
              <CheckCircleIcon />
            </div>
            <div>
              <h1 className="font-black text-2xl mb-1" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace', letterSpacing: '-0.04em' }}>
                Triage Complete
              </h1>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Your assessment has been submitted and a clinician has been notified.
              </p>
            </div>

            {/* CTAS Badge — large */}
            {ctasCfg && ctas && (
              <div
                className="flex flex-col items-center gap-1 px-8 py-4 rounded-2xl border"
                style={{
                  background: ctasCfg.bg,
                  borderColor: ctasCfg.border,
                  animation: ctas <= 2 ? 'ctas-glow 2.5s ease-in-out infinite' : undefined,
                }}
              >
                <span className="text-xs font-mono uppercase tracking-widest mb-1" style={{ color: ctasCfg.color, opacity: 0.75 }}>
                  Urgency Level
                </span>
                <span className="font-black text-4xl" style={{ color: ctasCfg.color, fontFamily: 'monospace', letterSpacing: '-0.04em', lineHeight: 1 }}>
                  CTAS {ctas}
                </span>
                <span className="font-bold text-base" style={{ color: ctasCfg.color }}>
                  {ctasCfg.label}
                </span>
                {confidenceLabel && (
                  <span className="text-xs mt-1 px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(0,0,0,0.2)', color: ctasCfg.color }}>
                    Confidence: {confidenceLabel}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Queue + Routing row ── */}
          <div className="r-fade-1 grid grid-cols-2 gap-4">
            {/* Queue number */}
            <div className="rounded-2xl p-5 text-center border"
              style={{ background: 'var(--color-dash-card)', borderColor: 'rgba(9,246,238,0.3)' }}>
              <p className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Queue Number
              </p>
              <p className="font-black text-4xl font-mono" style={{ color: '#09f6ee', fontFamily: 'monospace', animation: 'queue-pulse 3s ease-in-out infinite', letterSpacing: '-0.02em' }}>
                #{queueNum}
              </p>
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>Your priority ticket</p>
            </div>

            {/* Routing destination */}
            <div className="rounded-2xl p-5 border flex flex-col justify-between"
              style={{ background: 'var(--color-dash-card)', borderColor: ctasCfg ? `${ctasCfg.border}40` : 'rgba(21,81,80,0.5)' }}>
              <div>
                <p className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>Proceed To</p>
                {specialty && (
                  <span className="inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-2"
                    style={{ background: 'rgba(9,246,238,0.1)', border: '1px solid rgba(9,246,238,0.25)', color: '#09f6ee' }}>
                    {specialty}
                  </span>
                )}
                <div className="flex items-start gap-1.5 mb-2">
                  <span style={{ color: ctasCfg?.border ?? '#09f6ee', marginTop: 2 }}><LocationIcon /></span>
                  <p className="font-bold text-sm leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                    {route.destination}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <ClockIcon />
                Expected wait: <strong style={{ color: ctasCfg?.border ?? '#09f6ee' }}>{route.waitTime}</strong>
              </div>
            </div>
          </div>

          {/* ── Red Flags ── */}
          {hasRedFlags && (
            <div className="r-fade-2 rounded-2xl p-4 border"
              style={{ background: 'rgba(220,38,38,0.07)', borderColor: 'rgba(220,38,38,0.35)' }}>
              <div className="flex items-center gap-2 mb-3">
                <span style={{ color: '#dc2626' }}><AlertIcon /></span>
                <p className="text-xs font-mono uppercase tracking-widest font-bold" style={{ color: '#dc2626' }}>
                  Flagged Concerns
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {redFlags.map((flag) => (
                  <span key={flag} className="text-xs px-3 py-1.5 rounded-full font-medium"
                    style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.35)', color: '#fca5a5' }}>
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Assessment Summary ── */}
          <div className="r-fade-2">
            <DataCard label="Assessment Summary">
              <div className="flex flex-col divide-y" style={{ borderColor: 'rgba(21,81,80,0.4)' }}>

                {/* Complaint */}
                {complaint && (
                  <div className="flex items-start gap-3 pb-3">
                    <span className="text-xs font-mono uppercase tracking-wide mt-0.5 w-24 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                      Complaint
                    </span>
                    <p className="text-sm capitalize" style={{ color: 'var(--color-text-primary)' }}>{complaint}</p>
                  </div>
                )}

                {/* Pain */}
                {painLevel !== null && !isNaN(painLevel) && (
                  <div className="flex items-center gap-3 py-3">
                    <span className="text-xs font-mono uppercase tracking-wide w-24 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                      Pain Level
                    </span>
                    <div className="flex items-center gap-2.5 flex-1">
                      {/* Mini pain bar */}
                      <div className="flex gap-0.5">
                        {Array.from({ length: 10 }, (_, i) => (
                          <div key={i} className="rounded-sm"
                            style={{ width: 10, height: 14, background: i < painLevel ? PAIN_COLORS[i] : 'rgba(21,81,80,0.35)' }} />
                        ))}
                      </div>
                      <span className="font-bold text-sm font-mono" style={{ color: PAIN_COLORS[painLevel - 1], fontFamily: 'monospace' }}>
                        {painLevel}/10
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        — {PAIN_LABELS[painLevel]}
                      </span>
                    </div>
                  </div>
                )}

                {/* Session ID reference */}
                <div className="flex items-center gap-3 pt-3">
                  <span className="text-xs font-mono uppercase tracking-wide w-24 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                    Session ID
                  </span>
                  <span className="text-xs font-mono" style={{ color: 'var(--color-text-dim)' }}>
                    {sessionId.slice(0, 8).toUpperCase()}…
                  </span>
                </div>
              </div>
            </DataCard>
          </div>

          {/* ── Vital Signs ── */}
          {hasVitals && (
            <div className="r-fade-3">
              <DataCard label="Recorded Vital Signs">
                <div className="flex gap-3">
                  {(systolic && diastolic) && (
                    <VitalChip
                      icon={<HeartIcon />}
                      label="BP"
                      value={`${systolic}/${diastolic}`}
                      sub={bpClass ?? 'mmHg'}
                      color="#09f6ee"
                    />
                  )}
                  {heartRate && (
                    <VitalChip
                      icon={<HeartIcon />}
                      label="HR"
                      value={`${heartRate}`}
                      sub="bpm"
                      color="#36c9c5"
                    />
                  )}
                  {temperature && (
                    <VitalChip
                      icon={<ThermometerIcon />}
                      label="Temp"
                      value={`${temperature}°C`}
                      sub={temperature >= 38 ? 'Fever' : 'Normal'}
                      color="#86dfdc"
                    />
                  )}
                  {spo2 && (
                    <VitalChip
                      icon={<DropletIcon />}
                      label="SpO₂"
                      value={`${spo2}%`}
                      sub={spo2 < 90 ? 'Low' : 'Normal'}
                      color="#5dd5d3"
                    />
                  )}
                </div>
              </DataCard>
            </div>
          )}

          {/* ── Reasoning summary ── */}
          {session?.reasoning_summary && (
            <div className="r-fade-4">
              <DataCard label="Clinical Reasoning">
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {session.reasoning_summary}
                </p>
              </DataCard>
            </div>
          )}

          {/* ── What to expect ── */}
          {ctasExpect && (
            <div className="r-fade-3 rounded-2xl p-4 border flex items-start gap-3"
              style={{ background: `${ctasCfg?.bg ?? 'rgba(9,246,238,0.04)'}`, borderColor: `${ctasCfg?.border ?? 'rgba(9,246,238,0.2)'}50` }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>🕐</span>
              <p className="text-sm leading-relaxed font-semibold" style={{ color: ctasCfg?.color ?? 'var(--color-text-primary)' }}>
                {ctasExpect}
              </p>
            </div>
          )}

          {/* ── Next Steps ── */}
          <div className="r-fade-4 rounded-2xl p-5 border"
            style={{ background: 'rgba(9,246,238,0.04)', borderColor: 'rgba(9,246,238,0.2)' }}>
            <p className="text-xs font-mono uppercase tracking-widest mb-4" style={{ color: '#09f6ee' }}>
              What to do next
            </p>
            <div className="flex flex-col gap-3">
              {[
                `Proceed to: ${route.destination}`,
                'Show this screen or your queue number to reception staff',
                'A licensed clinician has been notified of your case',
                'Please remain in the waiting area — do not leave',
                ctas && ctas <= 2 ? 'If your condition worsens, immediately alert a staff member' : null,
              ].filter(Boolean).map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                    style={{ background: 'rgba(9,246,238,0.12)', color: '#09f6ee', border: '1px solid rgba(9,246,238,0.25)', fontFamily: 'monospace' }}>
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Disclaimer ── */}
          <p className="r-fade-5 text-xs text-center" style={{ color: 'var(--color-text-dim)' }}>
            This assessment is AI-assisted and has been reviewed by clinical rules.
            All final medical decisions are made by a licensed clinician.
          </p>

          {/* ── End Session Button ── */}
          <div className="r-fade-6 pt-2 pb-6">
            <button
              onClick={handleEndSession}
              className="end-btn w-full rounded-2xl font-bold text-base flex items-center justify-center gap-3"
              style={{
                minHeight: 64,
                background: 'transparent',
                border: '1.5px solid rgba(9,246,238,0.35)',
                color: '#09f6ee',
                cursor: 'pointer',
                fontFamily: 'monospace',
                letterSpacing: '-0.01em',
                fontSize: 16,
              }}
            >
              <LogOutIcon />
              End Session &amp; Return to Kiosk
            </button>
            <p className="text-xs text-center mt-3" style={{ color: 'var(--color-text-dim)' }}>
              Your session data will be cleared from this device
            </p>
          </div>

        </main>
        <EmergencyFab sessionId={sessionId} />
      </div>
    </>
  );
}
