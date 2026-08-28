'use client';

import { useAuthStore } from '@/store/auth';
import { useRouter, usePathname } from 'next/navigation';

interface DashboardNavProps {
  activeBoothCount: number;
  hasAlert: boolean;
}

const NAV_TABS = [
  { label: 'Queue', href: '/dashboard', exact: true },
  { label: 'Reports', href: '/dashboard/reports', exact: false },
];

const ADMIN_TAB = { label: 'Admin', href: '/dashboard/admin/users', exact: false };

export function DashboardNav({ activeBoothCount, hasAlert }: DashboardNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { userEmail, userRole, userFullName, logout } = useAuthStore();
  const displayName = userFullName || userEmail || 'Clinician';
  const isAdmin = userRole === 'admin';

  const tabs = isAdmin ? [...NAV_TABS, ADMIN_TAB] : NAV_TABS;

  function isActive(tab: typeof NAV_TABS[0]) {
    if (tab.exact) return pathname === tab.href;
    return pathname.startsWith(tab.href);
  }

  return (
    <header
      className="sticky top-0 z-30"
      style={{
        minHeight: '64px',
        // Translucent + blur so content scrolls under it, the way an iOS
        // navigation bar behaves. Opaque fallback for browsers without
        // backdrop-filter.
        background: 'rgba(5, 20, 20, 0.82)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid rgb(11, 40, 39)',
        display: 'flex',
        alignItems: 'center',
        // Wrap rather than overflow: on a phone the nav links would otherwise
        // push the role badge and avatar off the right edge.
        flexWrap: 'wrap',
        rowGap: '6px',
        padding: '6px 16px',
        // Standalone iOS overlays the status bar on the page.
        paddingTop: 'calc(6px + var(--safe-top))',
        paddingLeft: 'max(16px, var(--safe-left))',
        paddingRight: 'max(16px, var(--safe-right))',
        gap: '8px',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '12px' }}>
        <span style={{
          background: 'linear-gradient(135deg, rgb(54, 201, 197), rgb(9, 246, 238))',
          borderRadius: '8px', width: '32px', height: '32px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', fontWeight: 900, color: '#051414', flexShrink: 0,
        }}>
          ✚
        </span>
        <span style={{ color: 'rgb(240, 255, 254)', fontWeight: 700, fontSize: '16px', whiteSpace: 'nowrap' }}>
          SmartCare
        </span>
      </div>

      {/* Separator */}
      <span style={{ color: 'rgb(21, 81, 79)', fontSize: '16px' }}>|</span>

      {/* Nav tabs */}
      <nav className="hidden md:flex" style={{ alignItems: 'center', gap: '8px', marginLeft: '4px' }}>
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              style={{
                // >=44px tall so the tap area matches the iOS minimum; the
                // visual size is unchanged on desktop where the row is taller
                // than the text anyway.
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 14px',
                borderRadius: '8px',
                border: active ? '1px solid rgba(9,246,238,0.3)' : '1px solid transparent',
                background: active ? 'rgba(9,246,238,0.08)' : 'transparent',
                color: active ? '#09f6ee' : 'rgb(93, 213, 211)',
                fontSize: '13px',
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div style={{ flex: '1 1 0%' }} />

      {/* Booths Active — hidden on phones; the KPI strip already carries it */}
      <div className="hidden md:flex" style={{ alignItems: 'center', gap: '6px' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="3" rx="2" />
          <line x1="8" x2="16" y1="21" y2="21" />
          <line x1="12" x2="12" y1="17" y2="21" />
        </svg>
        <span style={{ color: 'rgb(34, 197, 94)', fontSize: '13px', whiteSpace: 'nowrap' }}>
          {activeBoothCount} Booths Active
        </span>
      </div>

      {/* Notification bell */}
      <button
        aria-label="Notifications"
        style={{
          position: 'relative', cursor: 'pointer', padding: '8px',
          background: 'none', border: 'none',
          // Expand the hit area around a small icon rather than enlarging it.
          minWidth: 44, minHeight: 44,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5dd5d3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.268 21a2 2 0 0 0 3.464 0" />
          <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
        </svg>
        {hasAlert && (
          <div style={{
            position: 'absolute', top: '4px', right: '4px',
            width: '16px', height: '16px', borderRadius: '50%',
            background: 'rgb(220, 38, 38)', color: 'white',
            fontSize: '10px', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>2</div>
        )}
      </button>

      {/* Role badge + user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="hidden md:inline" style={{
          fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px',
          textTransform: 'capitalize',
          background: isAdmin ? 'rgba(168,85,247,0.15)' : 'rgba(9,246,238,0.1)',
          border: `1px solid ${isAdmin ? 'rgba(168,85,247,0.4)' : 'rgba(9,246,238,0.25)'}`,
          color: isAdmin ? '#c084fc' : '#09f6ee',
        }}>
          {userRole || 'staff'}
        </span>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: 'linear-gradient(135deg, rgb(54, 201, 197), rgb(9, 246, 238))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#071c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <span style={{ color: 'rgb(240, 255, 254)', fontSize: '14px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </span>
      </div>

      {/* Sign Out */}
      <button
        onClick={() => { logout(); router.replace('/login'); }}
        aria-label="Sign out"
        style={{
          minWidth: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          minHeight: 44,
          borderRadius: '8px', border: '1px solid rgb(21, 81, 79)',
          background: 'transparent', padding: '6px 12px',
          color: 'rgb(93, 213, 211)', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span className="hidden md:inline">Sign Out</span>
      </button>
    </header>
  );
}
