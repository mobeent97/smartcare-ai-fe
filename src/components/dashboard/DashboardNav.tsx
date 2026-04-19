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

  return (
    <header className="flex items-center justify-between border-b border-dash-border bg-dash-surface px-6 h-12 shrink-0">
      {/* ── Left: Brand ───────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Logo mark */}
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sc-500 text-base font-extrabold text-dash-bg">
          +
        </span>
        <span className="text-base font-extrabold text-text-primary">
          SmartCare
        </span>
        <span className="text-sm text-dash-border">|</span>
        <span className="text-[13px] font-medium text-sc-500">
          Clinician Dashboard
        </span>
      </div>

      {/* ── Right: Status + Actions ───────────────────────── */}
      <div className="flex items-center gap-4">
        {/* Booths Active */}
        <span className="flex items-center gap-2 text-xs font-semibold text-sc-500">
          <span className="text-sm">🖥</span>
          {activeBoothCount} Booths Active
        </span>

        {/* Notification bell */}
        <button
          aria-label="Notifications"
          className="relative p-1 text-lg text-text-muted hover:text-sc-400 transition-colors"
        >
          🔔
          {hasAlert && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">
              2
            </span>
          )}
        </button>

        {/* User avatar + email */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sc-500 text-[13px] font-bold text-dash-bg">
            {(userEmail ?? '?').charAt(0).toUpperCase()}
          </div>
          <span className="text-[13px] text-sc-300">
            {userEmail}
          </span>
        </div>

        {/* Sign out */}
        <button
          onClick={() => {
            logout();
            router.replace('/login');
          }}
          className="text-xs text-text-dim hover:text-sc-400 transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
