'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { DashboardWebSocket } from '@/lib/websocket';
import { useAuthStore } from '@/store/auth';
import { useDashboardStore } from '@/store/dashboard';
import { CTASBadge } from '@/components/dashboard/CTASBadge';
import type { TriageSession } from '@/types/api';

function formatWait(createdAt: string) {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins < 1) return 'Just arrived';
  if (mins < 60) return `${mins}m waiting`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const CTAS_FILTERS = [0, 1, 2, 3, 4, 5];

export default function DashboardPage() {
  const router = useRouter();
  const { accessToken, userEmail, logout } = useAuthStore();
  const { queue, setQueue, updateQueueItem, emergencyAlert, setEmergencyAlert, clearEmergencyAlert } = useDashboardStore();
  const [filter, setFilter] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
      return;
    }

    api.getQueue().then((res) => setQueue(res.data));

    const ws = new DashboardWebSocket(
      accessToken,
      (sessionId, data) => updateQueueItem(sessionId, data),
      (alert) => setEmergencyAlert(alert)
    );
    ws.connect();
    return () => ws.disconnect();
  }, [accessToken, router, setQueue, updateQueueItem, setEmergencyAlert]);

  const filtered = queue
    .filter((s) => filter === 0 || s.ctas_level === filter)
    .filter((s) =>
      !search ||
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.red_flags.some((f) => f.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => (a.ctas_level ?? 5) - (b.ctas_level ?? 5));

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0f1e' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ backgroundColor: '#111827', borderBottom: '1px solid #374151' }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#36c9c5' }}>Smart Care AI</h1>
        <div className="flex items-center gap-4">
          <span style={{ color: '#9ca3af', fontSize: 13 }}>{userEmail}</span>
          <button
            onClick={() => { logout(); router.replace('/login'); }}
            style={{ color: '#6b7280', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Search + filters */}
        <div className="flex gap-3 mb-5 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID or symptom…"
            className="rounded-xl px-4 py-2 flex-1 min-w-48"
            style={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              color: '#f9fafb',
              fontSize: 14,
              outline: 'none',
            }}
          />
          <div className="flex gap-2">
            {CTAS_FILTERS.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                className="rounded-lg px-3 py-2 text-sm font-semibold transition-all"
                style={{
                  backgroundColor: filter === lvl ? '#36c9c5' : '#1f2937',
                  color: filter === lvl ? '#0a0f1e' : '#9ca3af',
                  border: '1px solid #374151',
                  minHeight: 40,
                }}
              >
                {lvl === 0 ? 'All' : lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Patient queue */}
        <div className="flex flex-col gap-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12" style={{ color: '#6b7280' }}>
              No patients in queue
            </div>
          ) : (
            filtered.map((session) => (
              <PatientCard
                key={session.id}
                session={session}
                onClick={() => router.push(`/dashboard/cases/${session.id}`)}
              />
            ))
          )}
        </div>
      </div>

      {/* Emergency Alert Modal */}
      {emergencyAlert && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
        >
          <div
            className="rounded-2xl p-8 max-w-md w-full mx-4 ctas-pulse"
            style={{ backgroundColor: '#1f2937', border: '3px solid #dc2626' }}
          >
            <div className="text-center mb-4">
              <span style={{ fontSize: 40 }}>🚨</span>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: '#dc2626', marginTop: 8 }}>
                CTAS 1 EMERGENCY
              </h2>
            </div>
            <p style={{ color: '#f9fafb', fontSize: 15, textAlign: 'center', marginBottom: 8 }}>
              Patient requires immediate resuscitation
            </p>
            <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', marginBottom: 4 }}>
              Session: #{emergencyAlert.sessionId.slice(-6).toUpperCase()}
            </p>
            {emergencyAlert.redFlags.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center my-4">
                {emergencyAlert.redFlags.map((flag) => (
                  <span
                    key={flag}
                    style={{
                      backgroundColor: 'rgba(220,38,38,0.2)',
                      border: '1px solid rgba(220,38,38,0.5)',
                      color: '#fca5a5',
                      padding: '2px 10px',
                      borderRadius: 9999,
                      fontSize: 12,
                    }}
                  >
                    {flag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  router.push(`/dashboard/cases/${emergencyAlert.sessionId}`);
                  clearEmergencyAlert();
                }}
                className="flex-1 rounded-xl font-bold"
                style={{ backgroundColor: '#dc2626', color: '#fff', padding: '12px 0', border: 'none', fontSize: 15 }}
              >
                View Patient
              </button>
              <button
                onClick={clearEmergencyAlert}
                className="flex-1 rounded-xl font-bold"
                style={{ backgroundColor: '#1f2937', color: '#9ca3af', padding: '12px 0', border: '1px solid #374151', fontSize: 15 }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PatientCard({ session, onClick }: { session: TriageSession; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl p-4 transition-all hover:brightness-110"
      style={{ backgroundColor: '#111827', border: '1px solid #374151' }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {session.ctas_level && <CTASBadge level={session.ctas_level} size="sm" />}
          <span style={{ color: '#9ca3af', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
            #{session.id.slice(-6).toUpperCase()}
          </span>
        </div>
        <span style={{ color: '#6b7280', fontSize: 12 }}>{formatWait(session.created_at)}</span>
      </div>
      {session.red_flags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {session.red_flags.slice(0, 3).map((flag) => (
            <span
              key={flag}
              style={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                color: '#d1d5db',
                padding: '2px 8px',
                borderRadius: 9999,
                fontSize: 11,
              }}
            >
              {flag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
