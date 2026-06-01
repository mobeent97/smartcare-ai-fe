'use client';

import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Catches uncaught render errors inside the booth flow. Without this, a
 * single bad component throws → blank white screen → patient is stranded
 * mid-triage with no way to call for help.
 *
 * Fallback shows: error message, a hard-refresh button, and explicit
 * instructions to alert staff.
 */
export class BoothErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log to console for now; Sentry hook lands in the observability batch.
    // Avoid sending PHI — only error type + component stack.
    console.error('[booth] uncaught error:', error.name, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: '' });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'var(--color-dash-bg)',
          color: 'var(--color-text-primary)',
          textAlign: 'center',
          gap: 18,
        }}
      >
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(220,38,38,0.12)',
          border: '1.5px solid rgba(220,38,38,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 34,
        }}>⚠️</div>

        <div>
          <h1 style={{
            fontSize: 22, fontWeight: 800, marginBottom: 8,
            fontFamily: 'monospace', letterSpacing: '-0.03em',
          }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', maxWidth: 380, lineHeight: 1.5 }}>
            The triage system has hit an error. <strong>Please notify a nurse or
            staff member at the front desk so they can assist you directly.</strong>
          </p>
        </div>

        <div style={{
          background: 'rgba(220,38,38,0.06)',
          border: '1px solid rgba(220,38,38,0.25)',
          borderRadius: 12,
          padding: '12px 16px',
          maxWidth: 420,
        }}>
          <p style={{ fontSize: 12, color: '#fca5a5', fontWeight: 600 }}>
            🚨 If this is an emergency, alert staff immediately or dial your
            local emergency number.
          </p>
        </div>

        <button
          onClick={this.handleRetry}
          style={{
            padding: '12px 24px',
            background: 'rgba(9,246,238,0.1)',
            border: '1.5px solid rgba(9,246,238,0.4)',
            borderRadius: 12,
            color: '#09f6ee',
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Reload
        </button>

        {process.env.NODE_ENV !== 'production' && this.state.message && (
          <p style={{ fontSize: 11, color: 'var(--color-text-dim)', fontFamily: 'monospace', maxWidth: 420 }}>
            {this.state.message}
          </p>
        )}
      </div>
    );
  }
}
