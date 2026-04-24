'use client';

import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';

interface DashboardNavProps {
  activeBoothCount: number;
  hasAlert: boolean;
}

export function DashboardNav({ activeBoothCount, hasAlert }: DashboardNavProps) {
  const router = useRouter();
  const { userEmail, logout } = useAuthStore();
  const displayName = userEmail || 'Dr. Sarah Chen';

  return (
    <header
      style={{
        height: '64px',
        background: 'rgb(5, 20, 20)',
        borderBottom: '1px solid rgb(11, 40, 39)',
        display: 'flex',
        alignItems: 'center',
        padding: '0px 24px',
        gap: '16px',
        flexShrink: 0,
      }}
    >
      {/* Logo group — margin-right: 20px matches Figma */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '20px' }}>
        <span
          style={{
            background: 'linear-gradient(135deg, rgb(54, 201, 197), rgb(9, 246, 238))',
            borderRadius: '8px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            fontWeight: 900,
            color: '#051414',
            flexShrink: 0,
          }}
        >
          ✚
        </span>
        <span style={{ color: 'rgb(240, 255, 254)', fontWeight: 700, fontSize: '16px' }}>
          SmartCare
        </span>
      </div>

      {/* Separator */}
      <span style={{ color: 'rgb(21, 81, 79)', fontSize: '16px' }}>|</span>

      {/* Sub-brand */}
      <span style={{ color: 'rgb(93, 213, 211)', fontSize: '14px' }}>
        Clinician Dashboard
      </span>

      {/* Spacer */}
      <div style={{ flex: '1 1 0%' }} />

      {/* Booths Active */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="3" rx="2" />
          <line x1="8" x2="16" y1="21" y2="21" />
          <line x1="12" x2="12" y1="17" y2="21" />
        </svg>
        <span style={{ color: 'rgb(34, 197, 94)', fontSize: '13px' }}>
          {activeBoothCount} Booths Active
        </span>
      </div>

      {/* Notification bell */}
      <button
        aria-label="Notifications"
        style={{ position: 'relative', cursor: 'pointer', padding: '8px', background: 'none', border: 'none' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5dd5d3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.268 21a2 2 0 0 0 3.464 0" />
          <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
        </svg>
        {hasAlert && (
          <div
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: 'rgb(220, 38, 38)',
              color: 'white',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            2
          </div>
        )}
      </button>

      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgb(54, 201, 197), rgb(9, 246, 238))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#071c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <span style={{ color: 'rgb(240, 255, 254)', fontSize: '14px' }}>
          {displayName}
        </span>
      </div>

      {/* Sign Out */}
      <button
        onClick={() => { logout(); router.replace('/login'); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          borderRadius: '8px',
          border: '1px solid rgb(21, 81, 79)',
          background: 'transparent',
          padding: '6px 12px',
          color: 'rgb(93, 213, 211)',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Sign Out
      </button>
    </header>
  );
}
