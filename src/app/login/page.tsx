'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const REMEMBER_KEY = 'smartcare-remember-email';

/* ─── Icons ─────────────────────────────────────────────────── */
const EcgIcon = () => (
  <svg width="28" height="16" viewBox="0 0 32 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M0 9 H7 L9 2 L12 16 L15 5 L17 13 L19 9 H32" />
  </svg>
);

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
);

/* ─── Page ───────────────────────────────────────────────────── */
export default function LoginPage() {
  const router = useRouter();
  const { setTokens, setUserEmail, setUserRole, setUserFullName } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Pre-fill email if previously remembered
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setTokens(res.data.access, res.data.refresh);
      setUserEmail(res.data.email || email);
      setUserRole(res.data.role || 'staff');
      setUserFullName(res.data.full_name || '');

      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, email);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      router.push('/dashboard');
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.12; }
          50%       { opacity: 0.22; }
        }
        @keyframes login-fade {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .login-card { animation: login-fade 0.5s ease both; }

        .field-wrap { position: relative; }
        .field-icon {
          position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
          pointer-events: none;
        }
        .field-input {
          width: 100%; padding: 13px 14px 13px 42px;
          background: var(--color-dash-surface);
          border: 1.5px solid rgba(21,81,80,0.6);
          border-radius: 12px;
          color: var(--color-text-primary);
          font-size: 15px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .field-input:focus {
          border-color: rgba(9,246,238,0.5);
          box-shadow: 0 0 0 3px rgba(9,246,238,0.07);
        }
        .field-input::placeholder { color: var(--color-text-dim); }
        .field-input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px #071c1c inset !important;
          -webkit-text-fill-color: #f0fffe !important;
          caret-color: #f0fffe;
        }

        .toggle-btn {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; padding: 4px;
          color: var(--color-text-muted);
          transition: color 0.15s;
          display: flex; align-items: center;
        }
        .toggle-btn:hover { color: #09f6ee; }

        .sign-in-btn {
          background: linear-gradient(135deg, #07c5bf 0%, #09f6ee 60%, #3af8f2 100%);
          color: #012221;
          transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
        }
        .sign-in-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(9,246,238,0.35);
          filter: brightness(1.06);
        }
        .sign-in-btn:active:not(:disabled) { transform: translateY(0); }

        .remember-check {
          width: 17px; height: 17px; border-radius: 5px; cursor: pointer;
          border: 1.5px solid rgba(9,246,238,0.35);
          background: var(--color-dash-surface);
          accent-color: #09f6ee;
          flex-shrink: 0;
        }

        @keyframes spin-login { to { transform: rotate(360deg); } }
        .spin { animation: spin-login 0.9s linear infinite; display: inline-block; }
      `}</style>

      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #023130 0%, #051414 45%, #012221 100%)' }}
      >
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(9,246,238,0.1) 0%, transparent 70%)',
            animation: 'glow-pulse 6s ease-in-out infinite',
          }}
        />
        {/* Dot pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(9,246,238,0.07) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* Back to home */}
        <Link
          href="/"
          className="relative z-10 flex items-center gap-1.5 text-xs mb-8 transition-opacity hover:opacity-80"
          style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace' }}
        >
          <ArrowLeftIcon /> Back to home
        </Link>

        {/* Card */}
        <div
          className="login-card relative z-10 w-full max-w-md rounded-3xl p-8 border"
          style={{
            background: 'rgba(7,28,28,0.85)',
            borderColor: 'rgba(21,81,80,0.5)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}
        >
          {/* Header */}
          <div className="text-center mb-8">
            {/* Logo */}
            <div className="flex items-center justify-center gap-2.5 mb-5">
              <span style={{ color: '#09f6ee' }}><EcgIcon /></span>
              <span
                className="font-black text-xl tracking-tight"
                style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace', letterSpacing: '-0.03em' }}
              >
                SmartCare<span style={{ color: '#09f6ee' }}>AI</span>
              </span>
            </div>

            {/* Badge */}
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-widest mb-3"
              style={{ background: 'rgba(9,246,238,0.06)', border: '1px solid rgba(9,246,238,0.18)', color: '#09f6ee' }}
            >
              <ShieldIcon /> Clinician Access
            </div>

            <h1 className="font-black text-2xl mb-1 tracking-tight" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace', letterSpacing: '-0.04em' }}>
              Sign in to Dashboard
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Authorized clinical staff only
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-5">

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold font-mono uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Email address
              </label>
              <div className="field-wrap">
                <span className="field-icon" style={{ color: 'var(--color-text-muted)' }}>
                  <MailIcon />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="clinician@hospital.com"
                  required
                  autoComplete="email"
                  className="field-input"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold font-mono uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Password
              </label>
              <div className="field-wrap">
                <span className="field-icon" style={{ color: 'var(--color-text-muted)' }}>
                  <LockIcon />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="field-input"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {/* Remember me row */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="remember-check"
                />
                <span className="text-sm transition-colors" style={{ color: 'var(--color-text-secondary)' }}>
                  Remember me
                </span>
              </label>
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', color: '#fca5a5' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="sign-in-btn w-full rounded-2xl font-black text-base flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ minHeight: 54, fontFamily: 'monospace', letterSpacing: '-0.01em' }}
            >
              {loading ? (
                <>
                  <span className="spin">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  </span>
                  Signing in…
                </>
              ) : (
                'Sign In to Dashboard →'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-5 border-t text-center" style={{ borderColor: 'rgba(21,81,80,0.4)' }}>
            <p className="text-xs flex items-center justify-center gap-1.5" style={{ color: 'var(--color-text-dim)' }}>
              <ShieldIcon />
              Secured · Session auto-expires after inactivity
            </p>
          </div>
        </div>

        {/* Footer note */}
        <p className="relative z-10 mt-6 text-xs font-mono" style={{ color: 'var(--color-text-dim)' }}>
          SmartCare AI · Clinician Dashboard · v1.0
        </p>
      </div>
    </>
  );
}
