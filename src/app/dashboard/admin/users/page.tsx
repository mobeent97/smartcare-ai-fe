'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { InviteUserModal } from '@/components/dashboard/InviteUserModal';
import { useDashboardStore } from '@/store/dashboard';
import type { AdminUser } from '@/types/api';

const ROLE_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  admin:      { color: '#c084fc', bg: 'rgba(168,85,247,0.12)',  label: 'Admin' },
  doctor:     { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  label: 'Doctor' },
  staff:      { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  label: 'Staff' },
  nurse:      { color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  label: 'Nurse' },
  technician: { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', label: 'Technician' },
};

const ROLES_LIST = ['admin', 'doctor', 'staff', 'nurse', 'technician'];

const CAPABILITY_MATRIX = [
  { action: 'View patient queue', admin: true, doctor: true, staff: true, nurse: true, technician: false },
  { action: 'View case detail', admin: true, doctor: true, staff: true, nurse: true, technician: false },
  { action: 'Override CTAS', admin: true, doctor: true, staff: true, nurse: false, technician: false },
  { action: 'Delete case', admin: true, doctor: true, staff: true, nurse: false, technician: false },
  { action: 'View reports', admin: true, doctor: true, staff: true, nurse: true, technician: false },
  { action: 'Admin panel', admin: true, doctor: false, staff: false, nurse: false, technician: false },
];

export default function AdminUsersPage() {
  const router = useRouter();
  const { userRole, _hasHydrated } = useAuthStore();
  const { emergencyAlert } = useDashboardStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Gate: non-admin redirect
  useEffect(() => {
    if (_hasHydrated && userRole !== 'admin') {
      router.replace('/dashboard');
    }
  }, [_hasHydrated, userRole, router]);

  function loadUsers() {
    setLoading(true);
    api.listUsers()
      .then(r => setUsers(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleRoleChange(userId: string, newRole: string) {
    setEditingRole(userId);
    try {
      const updated = await api.updateUser(userId, { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? updated.data : u));
    } catch { /* silent */ }
    setEditingRole(null);
  }

  async function handleToggleActive(user: AdminUser) {
    setTogglingId(user.id);
    try {
      const updated = await api.updateUser(user.id, { is_active: !user.is_active });
      setUsers(prev => prev.map(u => u.id === user.id ? updated.data : u));
    } catch { /* silent */ }
    setTogglingId(null);
  }

  if (!_hasHydrated || userRole !== 'admin') return null;

  return (
    <div className="tabbar-inset" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'rgb(5,20,20)' }}>
      <DashboardNav activeBoothCount={0} hasAlert={!!emergencyAlert} />

      {showInvite && (
        <InviteUserModal
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); loadUsers(); }}
        />
      )}

      <main style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', maxWidth: 1100, width: '100%', margin: '0 auto' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ color: '#e0fffe', fontSize: 24, fontWeight: 900, fontFamily: 'monospace', letterSpacing: '-0.03em' }}>
              Team Management
            </h1>
            <p style={{ color: 'rgba(93,213,211,0.5)', fontSize: 13, marginTop: 4 }}>
              Manage clinician access and roles for the dashboard
            </p>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            style={{
              padding: '10px 20px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #36c9c5, #09f6ee)',
              color: '#051414', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            }}
          >
            + Invite User
          </button>
        </div>

        {/* Users table — six columns cannot fit a phone, so the table keeps its
            shape and scrolls inside its own container rather than making the
            whole page scroll sideways. */}
        <div className="scroll-x" style={{ background: 'rgb(11,40,39)', border: '1px solid rgba(21,81,80,0.6)', borderRadius: 16, marginBottom: 32 }}>
          <div style={{ minWidth: 720 }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr', gap: 0, padding: '14px 24px', borderBottom: '1px solid rgba(21,81,80,0.4)', background: 'rgba(5,20,20,0.5)' }}>
            {['Name', 'Email', 'Role', 'Status', 'Joined', 'Actions'].map(h => (
              <span key={h} style={{ color: 'rgba(93,213,211,0.5)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</span>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(93,213,211,0.4)', fontFamily: 'monospace' }}>
              Loading…
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(93,213,211,0.3)' }}>No users found</div>
          ) : (
            users.map((user, idx) => {
              const roleStyle = ROLE_STYLES[user.role] ?? ROLE_STYLES.staff;
              const isLast = idx === users.length - 1;
              return (
                <div key={user.id} style={{
                  display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr',
                  gap: 0, padding: '16px 24px', alignItems: 'center',
                  borderBottom: isLast ? 'none' : '1px solid rgba(21,81,80,0.25)',
                  opacity: user.is_active ? 1 : 0.5,
                  transition: 'opacity 0.2s',
                }}>
                  {/* Name */}
                  <span style={{ color: '#e0fffe', fontSize: 14, fontWeight: 600 }}>{user.full_name || '—'}</span>

                  {/* Email */}
                  <span style={{ color: 'rgba(93,213,211,0.6)', fontSize: 12, fontFamily: 'monospace' }}>{user.email}</span>

                  {/* Role selector */}
                  <div>
                    <select
                      value={user.role}
                      disabled={editingRole === user.id}
                      onChange={e => handleRoleChange(user.id, e.target.value)}
                      style={{
                        background: roleStyle.bg,
                        border: `1px solid ${roleStyle.color}40`,
                        borderRadius: 8, padding: '4px 8px',
                        color: roleStyle.color, fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', outline: 'none',
                      }}
                    >
                      {ROLES_LIST.map(r => (
                        <option key={r} value={r} style={{ background: 'rgb(11,40,39)', color: '#e0fffe' }}>
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Status */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999,
                    display: 'inline-block', width: 'fit-content',
                    background: user.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
                    border: `1px solid ${user.is_active ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
                    color: user.is_active ? '#4ade80' : '#94a3b8',
                  }}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>

                  {/* Joined */}
                  <span style={{ color: 'rgba(93,213,211,0.4)', fontSize: 11, fontFamily: 'monospace' }}>
                    {new Date(user.date_joined).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </span>

                  {/* Toggle active */}
                  <button
                    onClick={() => handleToggleActive(user)}
                    disabled={togglingId === user.id}
                    style={{
                      padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${user.is_active ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                      background: user.is_active ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                      color: user.is_active ? '#f87171' : '#4ade80',
                      transition: 'all 0.15s',
                    }}
                  >
                    {togglingId === user.id ? '…' : user.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              );
            })
          )}
          </div>
        </div>

        {/* Role capability matrix */}
        <div style={{ background: 'rgb(11,40,39)', border: '1px solid rgba(21,81,80,0.6)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(21,81,80,0.4)' }}>
            <p style={{ color: 'rgba(9,246,238,0.5)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Role Capability Matrix
            </p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(21,81,80,0.4)' }}>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: 'rgba(93,213,211,0.4)', fontSize: 11, fontWeight: 700 }}>Action</th>
                  {['admin', 'doctor', 'staff', 'nurse', 'technician'].map(r => {
                    const s = ROLE_STYLES[r];
                    return (
                      <th key={r} style={{ padding: '12px 16px', textAlign: 'center', color: s.color, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
                        {r}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {CAPABILITY_MATRIX.map((row, i) => (
                  <tr key={i} style={{ borderBottom: i < CAPABILITY_MATRIX.length - 1 ? '1px solid rgba(21,81,80,0.2)' : 'none' }}>
                    <td style={{ padding: '12px 24px', color: '#e0fffe', fontSize: 13 }}>{row.action}</td>
                    {(['admin', 'doctor', 'staff', 'nurse', 'technician'] as const).map(role => (
                      <td key={role} style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {row[role] ? (
                          <span style={{ color: '#4ade80', fontSize: 16 }}>✓</span>
                        ) : (
                          <span style={{ color: 'rgba(93,213,211,0.2)', fontSize: 14 }}>—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
