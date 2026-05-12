'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useBoothStore } from '@/store/booth';

/* ─── SVG Icons ─────────────────────────────────────────────── */
const EcgLine = () => (
  <svg width="32" height="18" viewBox="0 0 32 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M0 9 H7 L9 2 L12 16 L15 5 L17 13 L19 9 H32" />
  </svg>
);

const SpinnerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
  </svg>
);

const CheckSmall = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const AlertTriangle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

/* ─── Avatar Illustration ────────────────────────────────────── */
const AvatarIllustration = () => (
  <svg width="110" height="130" viewBox="0 0 110 130" fill="none">
    {/* Pulse rings */}
    <circle cx="55" cy="42" r="38" stroke="#09f6ee" strokeWidth="1" opacity="0.15" style={{ animation: 'ring-pulse 2s ease-in-out infinite' }} />
    <circle cx="55" cy="42" r="30" stroke="#09f6ee" strokeWidth="1.5" opacity="0.25" style={{ animation: 'ring-pulse 2s ease-in-out infinite 0.4s' }} />
    {/* Head */}
    <circle cx="55" cy="42" r="22" fill="rgba(9,246,238,0.12)" stroke="#09f6ee" strokeWidth="1.5"/>
    {/* Face features */}
    <circle cx="48" cy="40" r="2.5" fill="#09f6ee" opacity="0.8"/>
    <circle cx="62" cy="40" r="2.5" fill="#09f6ee" opacity="0.8"/>
    <path d="M48 50 Q55 55 62 50" stroke="#09f6ee" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.8"/>
    {/* Shoulders / body */}
    <path d="M20 110 Q25 85 55 80 Q85 85 90 110" fill="rgba(9,246,238,0.08)" stroke="#09f6ee" strokeWidth="1.5" opacity="0.6"/>
    {/* Cross / medical */}
    <rect x="51" y="89" width="8" height="18" rx="2" fill="#09f6ee" opacity="0.5"/>
    <rect x="46" y="94" width="18" height="8" rx="2" fill="#09f6ee" opacity="0.5"/>
    {/* Status dot */}
    <circle cx="55" cy="124" r="4" fill="#22c55e" style={{ animation: 'status-pulse 1.5s ease-in-out infinite' }}/>
    <circle cx="55" cy="124" r="7" stroke="#22c55e" strokeWidth="1" opacity="0.4" style={{ animation: 'status-pulse 1.5s ease-in-out infinite 0.3s' }}/>
  </svg>
);

/* ─── Form Illustration ──────────────────────────────────────── */
const FormIllustration = () => (
  <svg width="110" height="130" viewBox="0 0 110 130" fill="none">
    {/* Clipboard background */}
    <rect x="20" y="18" width="70" height="90" rx="8" fill="rgba(134,223,220,0.08)" stroke="rgba(134,223,220,0.4)" strokeWidth="1.5"/>
    {/* Clip at top */}
    <rect x="40" y="12" width="30" height="14" rx="7" fill="rgba(134,223,220,0.15)" stroke="rgba(134,223,220,0.4)" strokeWidth="1.5"/>
    {/* Form lines */}
    <rect x="30" y="42" width="50" height="5" rx="2.5" fill="rgba(134,223,220,0.3)"/>
    <rect x="30" y="55" width="35" height="5" rx="2.5" fill="rgba(134,223,220,0.25)"/>
    <rect x="30" y="68" width="42" height="5" rx="2.5" fill="rgba(134,223,220,0.25)"/>
    {/* Checkmarks */}
    <circle cx="36" cy="83" r="5" fill="rgba(34,197,94,0.2)" stroke="#22c55e" strokeWidth="1.2"/>
    <path d="M33 83 L35.5 85.5 L39 81" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="44" y="80" width="30" height="5" rx="2.5" fill="rgba(134,223,220,0.25)"/>
    <circle cx="36" cy="96" r="5" fill="rgba(34,197,94,0.2)" stroke="#22c55e" strokeWidth="1.2"/>
    <path d="M33 96 L35.5 98.5 L39 94" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="44" y="93" width="22" height="5" rx="2.5" fill="rgba(134,223,220,0.2)"/>
  </svg>
);

/* ─── Feature Item ───────────────────────────────────────────── */
function FeatureItem({ text, accent }: { text: string; accent: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
        style={{ background: `${accent}20`, color: accent, border: `1px solid ${accent}40` }}>
        <CheckSmall />
      </span>
      <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{text}</span>
    </div>
  );
}

/* ─── Mode Card ──────────────────────────────────────────────── */
interface ModeCardProps {
  illustration: React.ReactNode;
  title: string;
  subtitle: string;
  features: string[];
  accentColor: string;
  buttonLabel: string;
  state: 'idle' | 'loading' | 'error';
  onSelect: () => void;
  onRetry: () => void;
  isPrimary?: boolean;
}

function ModeCard({ illustration, title, subtitle, features, accentColor, buttonLabel, state, onSelect, onRetry, isPrimary }: ModeCardProps) {
  const isLoading = state === 'loading';
  const isError = state === 'error';

  return (
    <div
      className="flex flex-col items-center text-center rounded-3xl p-7 border transition-all duration-200"
      style={{
        background: `linear-gradient(160deg, ${accentColor}06 0%, rgba(11,40,39,0.6) 100%)`,
        borderColor: isLoading ? `${accentColor}60` : isError ? 'rgba(220,38,38,0.4)' : `${accentColor}25`,
        boxShadow: isLoading ? `0 0 32px ${accentColor}15` : undefined,
        flex: 1,
        minWidth: 0,
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Illustration */}
      <div className="mb-5 relative">
        {illustration}
      </div>

      {/* Text */}
      <h2 className="font-black text-xl mb-2 tracking-tight" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
        {title}
      </h2>
      <p className="text-sm mb-6 leading-relaxed max-w-[240px]" style={{ color: 'var(--color-text-secondary)' }}>
        {subtitle}
      </p>

      {/* Features */}
      <div className="flex flex-col gap-2.5 mb-7 w-full text-left">
        {features.map((f) => <FeatureItem key={f} text={f} accent={accentColor} />)}
      </div>

      {/* Button */}
      <button
        onClick={isError ? onRetry : onSelect}
        disabled={isLoading}
        className="w-full rounded-2xl font-bold text-base py-4 flex items-center justify-center gap-2.5 transition-all duration-150"
        style={{
          minHeight: 60,
          background: isError
            ? 'rgba(220,38,38,0.12)'
            : isPrimary
              ? `linear-gradient(135deg, ${accentColor}cc, ${accentColor})`
              : 'transparent',
          color: isError ? '#fca5a5' : isPrimary ? '#012221' : accentColor,
          border: isPrimary && !isError ? 'none' : `1.5px solid ${isError ? 'rgba(220,38,38,0.5)' : `${accentColor}50`}`,
          opacity: isLoading ? 0.75 : 1,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontFamily: 'monospace',
          letterSpacing: '-0.01em',
        }}
      >
        {isLoading ? (
          <>
            <span style={{ animation: 'spin-btn 1s linear infinite', display: 'inline-block' }}>
              <SpinnerIcon />
            </span>
            Starting session…
          </>
        ) : isError ? (
          <>
            <AlertTriangle />
            Connection failed — Retry
          </>
        ) : (
          <>
            {buttonLabel}
            <span style={{ fontSize: '1.1em' }}>→</span>
          </>
        )}
      </button>

      {isError && (
        <p className="text-xs mt-3" style={{ color: 'rgba(252,165,165,0.7)' }}>
          Unable to reach server. Ask staff for assistance.
        </p>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────── */
export default function BoothWelcomePage() {
  const router = useRouter();
  const { setSessionId, setMode } = useBoothStore();

  const [avatarState, setAvatarState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [manualState, setManualState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [unableState, setUnableState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');


  async function handleAvatarMode() {
    if (avatarState === 'loading') return;
    setAvatarState('loading');
    try {
      const res = await api.createTriageSession();
      const sid = res.data.id;
      setSessionId(sid);
      setMode('avatar');
      router.push(`/booth/${sid}/consent?mode=avatar`);
    } catch {
      setAvatarState('error');
    }
  }

  async function handleManualMode() {
    if (manualState === 'loading') return;
    setManualState('loading');
    try {
      const res = await api.createTriageSession();
      const sid = res.data.id;
      setSessionId(sid);
      setMode('manual');
      // Manual flow needs consent too — route through the same gate so the
      // session has consent_given_at recorded for audit/GDPR.
      router.push(`/booth/${sid}/consent?mode=manual`);
    } catch {
      setManualState('error');
    }
  }

  async function handleUnableToAssess() {
    if (unableState === 'loading' || unableState === 'success') return;
    setUnableState('loading');
    try {
      const res = await api.createTriageSession();
      const sid = res.data.id;
      setSessionId(sid);
      await api.markUnableToAssess(sid, 'Companion-initiated: patient cannot self-respond');
      setUnableState('success');
    } catch {
      setUnableState('error');
    }
  }

  return (
    <>
      <style>{`
        @keyframes ring-pulse {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50%       { transform: scale(1.08); opacity: 0.3; }
        }
        @keyframes status-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.3); opacity: 0.6; }
        }
        @keyframes spin-btn {
          to { transform: rotate(360deg); }
        }
        @keyframes welcome-fade {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes glow-bg {
          0%, 100% { opacity: 0.14; }
          50%       { opacity: 0.24; }
        }
        .welcome-in { animation: welcome-fade 0.6s ease both; }
        .welcome-in-1 { animation: welcome-fade 0.6s 0.1s ease both; }
        .welcome-in-2 { animation: welcome-fade 0.6s 0.22s ease both; }
        .welcome-in-3 { animation: welcome-fade 0.6s 0.36s ease both; }
        .mode-card-wrap:hover { transform: translateY(-2px); }
        .mode-card-wrap { transition: transform 0.2s ease; }
      `}</style>

<div
        className="min-h-screen flex flex-col relative overflow-hidden"
        style={{ background: 'var(--color-dash-bg)' }}
      >
        {/* Background radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 60% 50% at 50% 20%, rgba(9,246,238,0.1) 0%, transparent 70%)',
            animation: 'glow-bg 6s ease-in-out infinite',
          }}
        />
        {/* Dot pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(9,246,238,0.07) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* ── Header ── */}
        <header className="relative z-10 flex items-center justify-center pt-10 pb-6 px-6">
          <div className="flex items-center gap-2.5">
            <span style={{ color: '#09f6ee' }}><EcgLine /></span>
            <span
              className="font-black text-xl tracking-tight"
              style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace', letterSpacing: '-0.03em' }}
            >
              SmartCare<span style={{ color: '#09f6ee' }}>AI</span>
            </span>
          </div>
        </header>

        {/* ── Hero text ── */}
        <div className="relative z-10 text-center px-6 mb-10">
          <div
            className="welcome-in inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full text-xs font-mono tracking-widest uppercase"
            style={{ background: 'rgba(9,246,238,0.06)', border: '1px solid rgba(9,246,238,0.2)', color: '#09f6ee' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#09f6ee]" style={{ animation: 'status-pulse 1.5s ease-in-out infinite' }} />
            Emergency Triage Kiosk · Walk-in Assessment
          </div>
          <h1
            className="welcome-in-1 font-black leading-tight mb-3"
            style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              fontFamily: 'monospace',
              letterSpacing: '-0.04em',
              background: 'linear-gradient(135deg, #f0fffe 0%, #86dfdc 60%, #09f6ee 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Welcome. How would you
            <br />
            like to check in?
          </h1>
          <p className="welcome-in-2 text-base max-w-md mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
            Choose how you'd like to complete your triage assessment.
            Both options take the same steps — just different experiences.
          </p>
        </div>

        {/* ── Mode Cards ── */}
        <div className="welcome-in-3 relative z-10 flex-1 flex flex-col md:flex-row gap-5 px-6 pb-8 max-w-3xl w-full mx-auto">

          {/* Avatar Mode */}
          <div className="mode-card-wrap flex-1">
            <ModeCard
              illustration={<AvatarIllustration />}
              title="AI Avatar Guide"
              subtitle="Be guided step-by-step by our AI nurse avatar with natural voice conversation."
              features={[
                'Voice + touch interaction',
                'Avatar explains every step',
                'Natural, conversational flow',
              ]}
              accentColor="#09f6ee"
              buttonLabel="Start with Avatar"
              state={avatarState}
              onSelect={handleAvatarMode}
              onRetry={() => { setAvatarState('idle'); handleAvatarMode(); }}
              isPrimary
            />
          </div>

          {/* Separator (desktop only) */}
          <div className="hidden md:flex flex-col items-center justify-center gap-3 flex-shrink-0">
            <div className="w-px flex-1" style={{ background: 'linear-gradient(to bottom, transparent, rgba(9,246,238,0.2), transparent)' }} />
            <span className="text-xs font-mono px-2 py-1 rounded-full" style={{ color: 'var(--color-text-muted)', background: 'var(--color-dash-card)', border: '1px solid rgba(21,81,80,0.5)' }}>
              OR
            </span>
            <div className="w-px flex-1" style={{ background: 'linear-gradient(to bottom, transparent, rgba(9,246,238,0.2), transparent)' }} />
          </div>

          {/* Mobile separator */}
          <div className="flex md:hidden items-center gap-3">
            <div className="flex-1 h-px" style={{ background: 'rgba(9,246,238,0.15)' }} />
            <span className="text-xs font-mono px-2 py-1 rounded-full" style={{ color: 'var(--color-text-muted)', background: 'var(--color-dash-card)', border: '1px solid rgba(21,81,80,0.5)' }}>
              OR
            </span>
            <div className="flex-1 h-px" style={{ background: 'rgba(9,246,238,0.15)' }} />
          </div>

          {/* Manual Mode */}
          <div className="mode-card-wrap flex-1">
            <ModeCard
              illustration={<FormIllustration />}
              title="Self-Registration"
              subtitle="Complete your triage assessment yourself using our step-by-step digital form."
              features={[
                'Type or tap your answers',
                'Go at your own pace',
                'Private & quiet experience',
              ]}
              accentColor="#86dfdc"
              buttonLabel="Fill Out Manually"
              state={manualState}
              onSelect={handleManualMode}
              onRetry={() => { setManualState('idle'); handleManualMode(); }}
              isPrimary={false}
            />
          </div>
        </div>

        {/* ── Unable to assess (companion-initiated escalation) ── */}
        <div className="relative z-10 text-center px-6 pb-4">
          {unableState === 'success' ? (
            <div className="inline-flex flex-col items-center gap-2 px-5 py-3 rounded-2xl"
              style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.4)' }}>
              <p style={{ color: '#fca5a5', fontWeight: 700, fontSize: 14 }}>
                🚨 Staff alerted — please remain with the patient
              </p>
              <p style={{ color: 'rgba(252,165,165,0.75)', fontSize: 12 }}>
                A clinician is on the way. Do not move the patient.
              </p>
            </div>
          ) : (
            <button
              onClick={handleUnableToAssess}
              disabled={unableState === 'loading'}
              style={{
                background: 'transparent',
                border: '1px solid rgba(220,38,38,0.35)',
                borderRadius: 12,
                padding: '10px 18px',
                color: '#fca5a5',
                fontFamily: 'monospace',
                fontSize: 12,
                fontWeight: 600,
                cursor: unableState === 'loading' ? 'not-allowed' : 'pointer',
                opacity: unableState === 'loading' ? 0.6 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                letterSpacing: '0.02em',
              }}
            >
              <span>🚨</span>
              {unableState === 'loading'
                ? 'Alerting staff…'
                : unableState === 'error'
                  ? 'Alert failed — tap to retry'
                  : 'Patient cannot respond? Alert staff →'}
            </button>
          )}
        </div>

        {/* ── Footer note ── */}
        <footer className="relative z-10 text-center px-6 pb-8">
          <p className="text-xs flex items-center justify-center gap-1.5" style={{ color: 'var(--color-text-dim)' }}>
            <ShieldIcon />
            Your session data is private and auto-deleted when complete. No data is stored without consent.
          </p>
        </footer>
      </div>
    </>
  );
}
