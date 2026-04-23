'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/* ─── Inline SVG Icons ───────────────────────────────────────── */

const EcgIcon = () => (
  <svg width="28" height="20" viewBox="0 0 28 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 10 H6 L8 4 L11 16 L14 7 L16 13 L18 10 H27" />
  </svg>
);

const AlertIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const UsersIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const ShuffleIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
    <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
    <line x1="4" y1="4" x2="9" y2="9"/>
  </svg>
);

const BotIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M12 11V3"/><circle cx="12" cy="3" r="1"/>
    <line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>
  </svg>
);

const BrainIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
  </svg>
);

const ZapIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

const MonitorIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);

const RefreshIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 .49-4.96"/>
  </svg>
);

const ClipboardIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);

/* ─── Data ───────────────────────────────────────────────────── */

const problems = [
  { icon: <ClockIcon />, title: 'Overcrowding', desc: '4–8 hour average wait times at peak periods' },
  { icon: <UsersIcon />, title: 'Nurse Burden', desc: '50–80 patients triaged manually per shift' },
  { icon: <ShuffleIcon />, title: 'Inconsistency', desc: 'Triage varies by experience, fatigue, and bias' },
  { icon: <AlertIcon />, title: 'Missed Escalations', desc: 'Patients deteriorate while waiting without reassessment' },
];

const steps = [
  { n: 1, name: 'Welcome & Consent', desc: 'Avatar greets the patient, consent screen displayed.' },
  { n: 2, name: 'Rapid Visual Triage', desc: 'Four key questions detect immediate life threats.' },
  { n: 3, name: 'Complaint Capture', desc: 'AI classifies free-text complaint with 92% confidence.' },
  { n: 4, name: 'Demographics', desc: 'Age and biological sex applied as CTAS modifiers.' },
  { n: 5, name: 'Symptom Detail', desc: 'Branching questions surface severity, onset, and radiation.' },
  { n: 6, name: 'Device Measurements', desc: 'BP, temperature, and SpO₂ collected and interpreted.' },
  { n: 7, name: 'CTAS Scoring', desc: 'Deterministic rules engine assigns acuity level 1–5.' },
  { n: 8, name: 'Routing', desc: 'CTAS + complaint maps patient to clinical destination.' },
  { n: 9, name: 'Results Displayed', desc: 'Avatar delivers outcome; clinician notified via WebSocket.' },
  { n: 10, name: 'Reassessment', desc: 'Every 10–15 min, system checks for deterioration.' },
];

const capabilities = [
  { icon: <BotIcon />, title: 'AI Avatar Guide', desc: 'Conversational nurse avatar guides patients step-by-step with natural speech.' },
  { icon: <BrainIcon />, title: 'CTAS Scoring Engine', desc: 'Deterministic rule-based logic — 90+ rules across 12 complaint categories.' },
  { icon: <ZapIcon />, title: 'Red Flag Detection', desc: '14 emergency patterns detected instantly. Cardiac arrest, airway compromise, hemorrhage trigger immediate workflow interrupt.' },
  { icon: <MonitorIcon />, title: 'Real-time Dashboard', desc: 'Clinicians see the live patient queue with WebSocket updates and full case detail.' },
  { icon: <RefreshIcon />, title: 'Auto Reassessment', desc: 'Celery tasks re-check every 10–15 min. Deterioration triggers escalation automatically.' },
  { icon: <ClipboardIcon />, title: 'Full Audit Trail', desc: 'Every decision references a specific rule ID. Logged, explainable, and exportable.' },
];

const techStack = [
  { layer: 'Backend', tech: 'Django 5 + DRF' },
  { layer: 'Real-time', tech: 'Django Channels + Redis' },
  { layer: 'Database', tech: 'PostgreSQL 16' },
  { layer: 'Task Queue', tech: 'Celery + Redis' },
  { layer: 'Frontend', tech: 'Next.js 15' },
  { layer: 'LLM', tech: 'OpenAI GPT-4o-mini' },
  { layer: 'Avatar', tech: 'AKOOL + Agora RTC' },
  { layer: 'Speech', tech: 'faster-whisper (local)' },
];

const aiDoes = [
  'Format questions naturally for speech',
  'Convert patient speech to text',
  'Classify complaints (fallback only)',
  'Generate session summaries',
  'Detect conversation intent',
];

const aiDoesNot = [
  'Decide CTAS urgency levels',
  'Override rule-based decisions',
  'Diagnose medical conditions',
  'Prescribe treatments',
  'Access patient medical records',
];

/* ─── Animated ECG Path ─────────────────────────────────────── */
function EcgLine() {
  return (
    <div className="relative w-full overflow-hidden h-12 opacity-20 pointer-events-none select-none">
      <svg
        viewBox="0 0 1200 48"
        preserveAspectRatio="none"
        className="w-full h-full"
        style={{ strokeDasharray: 1200, animation: 'ecg-draw 3s ease-in-out infinite' }}
      >
        <path
          d="M0,24 L120,24 L140,24 L150,4 L160,44 L175,8 L190,36 L200,24 L320,24 L340,24 L350,4 L360,44 L375,8 L390,36 L400,24 L520,24 L540,24 L550,4 L560,44 L575,8 L590,36 L600,24 L720,24 L740,24 L750,4 L760,44 L775,8 L790,36 L800,24 L920,24 L940,24 L950,4 L960,44 L975,8 L990,36 L1000,24 L1200,24"
          fill="none"
          stroke="#09f6ee"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* ─── Component ─────────────────────────────────────────────── */
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      {/* ── Global animation styles ── */}
      <style>{`
        html { scroll-behavior: smooth; }

        @keyframes ecg-draw {
          0%   { stroke-dashoffset: 1200; opacity: 0; }
          10%  { opacity: 1; }
          80%  { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: -200; opacity: 0; }
        }

        @keyframes glow-pulse {
          0%, 100% { opacity: 0.12; transform: scale(1); }
          50%       { opacity: 0.22; transform: scale(1.08); }
        }

        @keyframes glow-pulse-2 {
          0%, 100% { opacity: 0.07; transform: scale(1); }
          50%       { opacity: 0.14; transform: scale(1.05); }
        }

        @keyframes fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes dot-scan {
          0%   { background-position: 0 0; }
          100% { background-position: 40px 40px; }
        }

        @keyframes border-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(9,246,238,0); }
          50%       { box-shadow: 0 0 20px 2px rgba(9,246,238,0.15); }
        }

        .fade-up { animation: fade-up 0.7s ease both; }
        .fade-up-1 { animation: fade-up 0.7s 0.1s ease both; }
        .fade-up-2 { animation: fade-up 0.7s 0.2s ease both; }
        .fade-up-3 { animation: fade-up 0.7s 0.35s ease both; }
        .fade-up-4 { animation: fade-up 0.7s 0.5s ease both; }

        .dot-bg {
          background-image: radial-gradient(circle, rgba(9,246,238,0.08) 1px, transparent 1px);
          background-size: 28px 28px;
        }

        .card-hover {
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .card-hover:hover {
          transform: translateY(-3px);
          border-color: rgba(9,246,238,0.35) !important;
          box-shadow: 0 8px 32px rgba(9,246,238,0.08);
        }

        .btn-primary {
          background: linear-gradient(135deg, #07c5bf 0%, #09f6ee 50%, #3af8f2 100%);
          color: #012221;
          transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(9,246,238,0.4);
          filter: brightness(1.08);
        }
        .btn-primary:active { transform: translateY(0); }

        .btn-outline {
          border: 1.5px solid rgba(9,246,238,0.4);
          color: #09f6ee;
          transition: background 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s;
        }
        .btn-outline:hover {
          background: rgba(9,246,238,0.08);
          border-color: rgba(9,246,238,0.7);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(9,246,238,0.15);
        }

        .step-card {
          transition: background 0.2s, border-color 0.2s, transform 0.2s;
        }
        .step-card:hover {
          background: rgba(21,81,80,0.5) !important;
          border-color: rgba(9,246,238,0.3) !important;
          transform: translateY(-2px);
        }

        .tech-chip {
          transition: background 0.15s, border-color 0.15s;
        }
        .tech-chip:hover {
          background: rgba(9,246,238,0.1);
          border-color: rgba(9,246,238,0.4);
        }

        .nav-blur {
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .stat-separator {
          background: linear-gradient(to bottom, transparent, rgba(9,246,238,0.3), transparent);
        }

        @media (max-width: 640px) {
          .steps-scroll {
            display: flex;
            flex-direction: row;
            overflow-x: auto;
            gap: 12px;
            padding-bottom: 12px;
            scroll-snap-type: x mandatory;
          }
          .steps-scroll::-webkit-scrollbar { height: 3px; }
          .steps-scroll::-webkit-scrollbar-track { background: #071c1c; }
          .steps-scroll::-webkit-scrollbar-thumb { background: #155150; border-radius: 3px; }
          .step-card-mobile { min-width: 220px; scroll-snap-align: start; }
        }
      `}</style>

      <div className="min-h-screen" style={{ background: 'var(--color-dash-bg)', color: 'var(--color-text-primary)' }}>

        {/* ════════════════════ NAVBAR ════════════════════ */}
        <nav
          className={`fixed top-0 left-0 right-0 z-50 nav-blur transition-all duration-300 ${
            scrolled ? 'border-b border-[rgba(9,246,238,0.12)]' : ''
          }`}
          style={{ background: scrolled ? 'rgba(5,20,20,0.92)' : 'rgba(5,20,20,0.7)' }}
        >
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            {/* Wordmark */}
            <div className="flex items-center gap-2.5">
              <span style={{ color: '#09f6ee' }}><EcgIcon /></span>
              <span className="font-bold text-lg tracking-tight" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
                SmartCare<span style={{ color: '#09f6ee' }}>AI</span>
              </span>
            </div>

            {/* Nav links */}
            <div className="flex items-center gap-3">
              <Link
                href="/booth"
                className="btn-outline text-sm font-medium px-5 py-2 rounded-full hidden sm:flex items-center gap-2"
              >
                <span style={{ color: '#09f6ee' }}>⬡</span> Patient Kiosk
              </Link>
              <Link
                href="/login"
                className="btn-primary text-sm font-semibold px-5 py-2 rounded-full flex items-center gap-1.5"
              >
                Clinician Login <ArrowRightIcon />
              </Link>
            </div>
          </div>
        </nav>

        {/* ════════════════════ HERO ════════════════════ */}
        <section
          className="relative min-h-screen flex flex-col items-center justify-center pt-16 overflow-hidden dot-bg"
          style={{ background: 'linear-gradient(160deg, #023130 0%, #051414 45%, #012221 100%)' }}
        >
          {/* Glow orbs */}
          <div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(9,246,238,0.18) 0%, transparent 70%)',
              animation: 'glow-pulse 6s ease-in-out infinite',
            }}
          />
          <div
            className="absolute top-1/3 left-1/4 w-[400px] h-[400px] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(54,201,197,0.10) 0%, transparent 70%)',
              animation: 'glow-pulse-2 8s ease-in-out infinite 2s',
            }}
          />

          {/* Content */}
          <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
            {/* Badge */}
            <div className="fade-up inline-flex items-center gap-2 mb-8 px-4 py-1.5 rounded-full border text-xs font-mono tracking-wider uppercase"
              style={{ borderColor: 'rgba(9,246,238,0.25)', background: 'rgba(9,246,238,0.06)', color: '#09f6ee' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#09f6ee] inline-block" style={{ animation: 'glow-pulse 1.5s ease-in-out infinite' }} />
              CTAS-Validated AI Triage System · v1.0
            </div>

            {/* Headline */}
            <h1
              className="fade-up-1 font-black leading-none mb-6"
              style={{
                fontSize: 'clamp(3rem, 8vw, 6rem)',
                background: 'linear-gradient(135deg, #f0fffe 0%, #86dfdc 50%, #09f6ee 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: '-0.04em',
                fontFamily: 'monospace',
              }}
            >
              Smarter Triage.
              <br />
              Safer Care.
            </h1>

            {/* Subheadline */}
            <p
              className="fade-up-2 text-lg md:text-xl leading-relaxed mb-10 max-w-2xl mx-auto"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              SmartCare AI is a kiosk-based AI triage system that guides patients through a clinically-validated
              assessment, assigns a <span style={{ color: '#09f6ee' }} className="font-semibold">CTAS urgency score</span>,
              and delivers real-time insights to your clinical team.
            </p>

            {/* CTA Buttons */}
            <div className="fade-up-3 flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
              <Link
                href="/booth"
                className="btn-primary font-bold text-base px-8 py-3.5 rounded-full flex items-center gap-2 w-full sm:w-auto justify-center"
              >
                <span style={{ fontSize: '1.1em' }}>⬡</span>
                Start Patient Triage
              </Link>
              <Link
                href="/login"
                className="btn-outline font-semibold text-base px-8 py-3.5 rounded-full flex items-center gap-2 w-full sm:w-auto justify-center"
              >
                <MonitorIcon />
                Clinician Dashboard
              </Link>
            </div>

            {/* Disclaimer */}
            <p className="fade-up-3 text-xs mb-12" style={{ color: 'var(--color-text-dim)' }}>
              AI assists — clinicians decide. Every triage decision is fully explainable and auditable.
            </p>

            {/* ECG Line */}
            <div className="fade-up-4 mb-10">
              <EcgLine />
            </div>

            {/* Stats */}
            <div className="fade-up-4 flex items-center justify-center gap-0 divide-x divide-[rgba(9,246,238,0.15)]">
              {[
                { label: 'CTAS 1–5 Scoring', sub: 'Standardized acuity' },
                { label: 'Real-time Dashboard', sub: 'WebSocket updates' },
                { label: '10-Step Journey', sub: 'End-to-end guided' },
              ].map((s, i) => (
                <div key={i} className="px-8 py-2 text-center">
                  <div className="font-bold text-sm md:text-base" style={{ color: '#09f6ee', fontFamily: 'monospace' }}>{s.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40">
            <div className="text-xs font-mono tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>Scroll</div>
            <div className="w-px h-8 bg-gradient-to-b from-[#09f6ee] to-transparent" />
          </div>
        </section>

        {/* ════════════════════ PROBLEM ════════════════════ */}
        <section
          className="py-24 px-6"
          style={{ background: 'var(--color-dash-surface)' }}
        >
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: '#09f6ee' }}>The Problem</p>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
                Emergency Departments Are Under Strain
              </h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {problems.map((p, i) => (
                <div
                  key={i}
                  className="card-hover rounded-2xl p-6 border"
                  style={{ background: 'var(--color-dash-card)', borderColor: 'rgba(21,81,80,0.6)' }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: 'rgba(9,246,238,0.08)', color: '#09f6ee' }}>
                    {p.icon}
                  </div>
                  <h3 className="font-bold text-base mb-2" style={{ color: 'var(--color-text-primary)' }}>{p.title}</h3>
                  <p className="text-sm leading-snug" style={{ color: 'var(--color-text-secondary)' }}>{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════ HOW IT WORKS ════════════════════ */}
        <section
          className="py-24 px-6 overflow-hidden"
          style={{ background: 'var(--color-dash-bg)' }}
        >
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: '#09f6ee' }}>Patient Journey</p>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
                A Complete Triage Journey
              </h2>
              <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                From first contact to monitored routing — every step is guided and audited.
              </p>
            </div>

            {/* Steps — scrollable on mobile, grid on desktop */}
            <div className="steps-scroll md:grid md:grid-cols-5 md:gap-4 gap-0">
              {steps.map((s) => (
                <div
                  key={s.n}
                  className="step-card step-card-mobile md:min-w-0 rounded-2xl p-5 border"
                  style={{ background: 'rgba(11,40,39,0.7)', borderColor: 'rgba(21,81,80,0.45)' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black font-mono flex-shrink-0"
                      style={{ background: 'rgba(9,246,238,0.12)', color: '#09f6ee', border: '1px solid rgba(9,246,238,0.25)' }}
                    >
                      {s.n}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm mb-1.5" style={{ color: 'var(--color-text-primary)' }}>{s.name}</h4>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{s.desc}</p>
                </div>
              ))}
            </div>

            {/* Connection line visual */}
            <div className="hidden md:flex items-center justify-center mt-8 gap-1 opacity-30">
              {steps.map((_, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#09f6ee' }} />
                  {i < steps.length - 1 && <div className="w-8 h-px" style={{ background: '#09f6ee' }} />}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════ CAPABILITIES ════════════════════ */}
        <section
          className="py-24 px-6"
          style={{ background: 'var(--color-dash-surface)' }}
        >
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: '#09f6ee' }}>Key Capabilities</p>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
                Built for Clinical Precision
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {capabilities.map((c, i) => (
                <div
                  key={i}
                  className="card-hover rounded-2xl p-6 border flex flex-col gap-4"
                  style={{ background: 'var(--color-dash-card)', borderColor: 'rgba(21,81,80,0.5)' }}
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, rgba(9,246,238,0.12), rgba(54,201,197,0.06))', color: '#09f6ee', border: '1px solid rgba(9,246,238,0.15)' }}>
                    {c.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-base mb-1.5" style={{ color: 'var(--color-text-primary)' }}>{c.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════ SAFETY ════════════════════ */}
        <section
          className="py-24 px-6"
          style={{ background: '#f0fffe' }}
        >
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: '#07c5bf' }}>Safety Architecture</p>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight" style={{ color: '#023130', fontFamily: 'monospace' }}>
                The AI Does NOT Diagnose
              </h2>
              <p className="mt-3 text-sm max-w-xl mx-auto" style={{ color: '#2aa2a0' }}>
                Every clinical decision follows deterministic, rule-based logic. The LLM is used only for natural conversation — never for triage decisions.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* AI Does */}
              <div className="rounded-2xl p-7 border" style={{ background: '#ebfafa', borderColor: '#aeeae8' }}>
                <h3 className="font-bold text-base mb-5 flex items-center gap-2" style={{ color: '#023130' }}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#22c55e', color: '#fff' }}>
                    <CheckIcon />
                  </span>
                  AI Does
                </h3>
                <ul className="space-y-3">
                  {aiDoes.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm" style={{ color: '#0b2827' }}>
                      <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                        <CheckIcon />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* AI Does NOT */}
              <div className="rounded-2xl p-7 border" style={{ background: '#fff5f5', borderColor: '#fecaca' }}>
                <h3 className="font-bold text-base mb-5 flex items-center gap-2" style={{ color: '#7f1d1d' }}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#dc2626', color: '#fff' }}>
                    <XIcon />
                  </span>
                  AI Does NOT
                </h3>
                <ul className="space-y-3">
                  {aiDoesNot.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm" style={{ color: '#7f1d1d' }}>
                      <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>
                        <XIcon />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Privacy callout */}
            <div className="rounded-2xl p-6 border flex items-start gap-4" style={{ background: 'rgba(7,197,191,0.06)', borderColor: '#07c5bf' }}>
              <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5" style={{ background: 'rgba(7,197,191,0.12)', color: '#07c5bf' }}>
                <ShieldIcon />
              </div>
              <div>
                <p className="font-semibold text-sm mb-1" style={{ color: '#023130' }}>Privacy by Design</p>
                <p className="text-sm leading-relaxed" style={{ color: '#2aa2a0' }}>
                  Patient data is <strong style={{ color: '#023130' }}>ephemeral</strong> — auto-wiped when the session closes.
                  Audio is transcribed in memory and immediately discarded. No patient data is sent to external APIs except de-identified text.
                  Session timeout: 10 minutes of inactivity triggers auto-close and data wipe.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════ TECH STACK ════════════════════ */}
        <section
          className="py-24 px-6"
          style={{ background: 'var(--color-dash-bg)' }}
        >
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-mono tracking-widest uppercase mb-3" style={{ color: '#09f6ee' }}>Technology</p>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
                Production-Grade Stack
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {techStack.map((t, i) => (
                <div
                  key={i}
                  className="tech-chip rounded-xl p-4 border text-center"
                  style={{ background: 'rgba(11,40,39,0.6)', borderColor: 'rgba(21,81,80,0.5)' }}
                >
                  <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>{t.layer}</div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{t.tech}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════ CTA BANNER ════════════════════ */}
        <section
          className="py-24 px-6 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #023130 0%, #04625f 50%, #023130 100%)' }}
        >
          {/* Background glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(9,246,238,0.12) 0%, transparent 70%)',
            }}
          />
          <div className="relative z-10 max-w-3xl mx-auto text-center">
            <h2
              className="font-black mb-4 tracking-tight"
              style={{ fontSize: 'clamp(1.8rem, 5vw, 3.5rem)', color: 'var(--color-text-primary)', fontFamily: 'monospace' }}
            >
              Ready to transform your ED triage?
            </h2>
            <p className="text-lg mb-10" style={{ color: 'var(--color-text-secondary)' }}>
              Deploy SmartCare AI in your emergency department and give every patient a consistent, clinically-validated first assessment.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/booth"
                className="btn-primary font-bold text-base px-9 py-4 rounded-full flex items-center gap-2 w-full sm:w-auto justify-center"
              >
                <span style={{ fontSize: '1.1em' }}>⬡</span>
                Launch Patient Kiosk
              </Link>
              <Link
                href="/login"
                className="btn-outline font-semibold text-base px-9 py-4 rounded-full flex items-center gap-2 w-full sm:w-auto justify-center"
                style={{ color: '#f0fffe', borderColor: 'rgba(240,255,254,0.35)' }}
              >
                <MonitorIcon />
                Access Clinical Dashboard
              </Link>
            </div>
          </div>
        </section>

        {/* ════════════════════ FOOTER ════════════════════ */}
        <footer
          className="py-8 px-6 border-t text-center"
          style={{ background: 'var(--color-dash-surface)', borderColor: 'rgba(21,81,80,0.4)' }}
        >
          <p className="text-xs font-mono" style={{ color: 'var(--color-text-dim)' }}>
            SmartCare AI Triage Booth — Confidential Implementation Plan&nbsp;&nbsp;|&nbsp;&nbsp;Version 1.0&nbsp;&nbsp;|&nbsp;&nbsp;April 2026
          </p>
        </footer>

      </div>
    </>
  );
}
