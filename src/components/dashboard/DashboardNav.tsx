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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-dash-border bg-[#051414] px-6">
      {/* ── Left: Brand ───────────────────────────────────── */}
      <div className="flex items-center gap-4">
        {/* Logo group */}
        <div className="flex items-center gap-2.5">
          {/* Logo mark (Rounded square with plus) */}
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-sc-400 text-lg font-bold text-dash-bg">
            +
          </span>
          {/* Brand Name */}
          <span className="text-base font-bold text-text-primary">
            SmartCare
          </span>
        </div>

        {/* Separator */}
        <div className="h-6 w-px bg-dash-border/60 mx-1" />

        {/* Sub-brand text */}
        <span className="text-sm font-normal text-sc-500">
          Clinician Dashboard
        </span>
      </div>

      {/* ── Right: Status + Actions ───────────────────────── */}
      <div className="flex items-center gap-6">
        {/* Booths Active */}
        <span className="flex items-center gap-2 text-[13px] font-normal text-success">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          {activeBoothCount} Booths Active
        </span>

        {/* Notification bell */}
        <button
          aria-label="Notifications"
          className="relative text-sc-500 transition-colors hover:text-text-primary"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {hasAlert && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white ring-2 ring-[#051414]">
              2
            </span>
          )}
        </button>

        {/* User avatar + name */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sc-400 text-dash-bg">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <span className="text-sm font-normal text-text-primary">
            {displayName}
          </span>
        </div>

        {/* Sign Out */}
        <button
          onClick={() => {
            logout();
            router.replace('/login');
          }}
          className="flex items-center gap-1.5 rounded-lg border border-dash-border px-3 py-1.5 text-xs font-semibold text-text-dim transition-colors hover:border-danger/50 hover:text-danger"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign Out
        </button>
      </div>
    </header>
  );
}

