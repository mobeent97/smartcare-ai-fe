'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

/**
 * iOS-style bottom tab bar. Phone only — the desktop header keeps its inline
 * tabs.
 *
 * Bottom rather than top because the top of a 6.9" screen is out of thumb
 * reach; iOS puts primary navigation at the bottom for exactly this reason.
 * Capped at 4 destinations (guideline is <=5), each >=44pt with an 8px gap,
 * and padded by the home-indicator inset so the last row of a list is never
 * hidden behind it.
 */

type Tab = { label: string; href: string; exact: boolean; icon: React.ReactNode };

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const QUEUE: Tab = {
  label: 'Queue', href: '/dashboard', exact: true,
  icon: (
    <svg {...iconProps}>
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
};

const REPORTS: Tab = {
  label: 'Reports', href: '/dashboard/reports', exact: false,
  icon: (
    <svg {...iconProps}>
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
};

const ADMIN: Tab = {
  label: 'Admin', href: '/dashboard/admin/users', exact: false,
  icon: (
    <svg {...iconProps}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

export function MobileTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = useAuthStore((s) => s.userRole) === 'admin';
  const tabs = isAdmin ? [QUEUE, REPORTS, ADMIN] : [QUEUE, REPORTS];

  const active = (t: Tab) => (t.exact ? pathname === t.href : pathname.startsWith(t.href));

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex md:hidden"
      style={{
        // Translucent + blur, the way a native tab bar sits over content.
        background: 'rgba(5,20,20,0.82)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderTop: '1px solid rgba(21,81,80,0.6)',
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {tabs.map((t) => {
        const on = active(t);
        return (
          <button
            key={t.href}
            onClick={() => router.push(t.href)}
            aria-current={on ? 'page' : undefined}
            className="flex flex-1 flex-col items-center justify-center gap-1"
            style={{
              minHeight: 52,
              padding: '7px 4px 6px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: on ? '#09f6ee' : 'rgba(93,213,211,0.62)',
              // Opacity/colour only — never a transform, which would shift the
              // bar's layout on every tap.
              transition: 'color 0.15s',
            }}
          >
            {t.icon}
            <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500, letterSpacing: '0.01em' }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
