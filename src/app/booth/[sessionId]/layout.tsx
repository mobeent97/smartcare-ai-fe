'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';

const CONSENT_VALID_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Session-level guard: if the patient resumes an old session URL more than
 * 30 minutes after consent (or with no consent at all), force them back to
 * the consent screen. Required for GDPR/HIPAA — implicit consent expires.
 *
 * Skips: the consent page itself, and the emergency / results / vitals
 * exit screens (where blocking the patient mid-emergency would be unsafe).
 */
const GUARDED_PREFIXES_TO_SKIP = [
  '/consent',
  '/emergency',
  '/results',
  '/vitals/results',
];

export default function BoothSessionLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { sessionId } = useParams<{ sessionId: string }>();
  const [checked, setChecked] = useState(false);

  const skip = !sessionId || GUARDED_PREFIXES_TO_SKIP.some((p) => pathname.endsWith(p));

  useEffect(() => {
    if (skip) { setChecked(true); return; }
    let cancelled = false;
    api.getSessionResults(sessionId)
      .then((res) => {
        if (cancelled) return;
        const s = res.data as unknown as {
          consent_given_at?: string | null;
          created_at?: string | null;
          status?: string;
        };
        const consentMs = s.consent_given_at ? Date.parse(s.consent_given_at) : NaN;
        const everConsented = !isNaN(consentMs);
        const valid = everConsented && (Date.now() - consentMs) < CONSENT_VALID_MS;
        if (!valid) {
          // Only mark `resumed=1` when consent WAS given previously and has now
          // expired. First-time consent shows no banner — it's not a "resume".
          const suffix = everConsented ? '?resumed=1' : '';
          router.replace(`/booth/${sessionId}/consent${suffix}`);
          return;
        }
        setChecked(true);
      })
      .catch(() => {
        // Unreachable session → fail-safe to consent, no resumed banner
        // (might be a brand-new session whose results endpoint is rate-limited
        // or transient — better not to mislead the patient).
        if (!cancelled) router.replace(`/booth/${sessionId}/consent`);
      });
    return () => { cancelled = true; };
  }, [sessionId, skip, router]);

  if (!checked) {
    // Tiny placeholder while guard runs — avoids flashing the original page,
    // which could confuse the patient when we then redirect.
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-dash-bg)',
        color: 'var(--color-text-muted)',
        fontFamily: 'monospace',
        fontSize: 13,
      }}>
        Resuming session…
      </div>
    );
  }

  return <>{children}</>;
}
