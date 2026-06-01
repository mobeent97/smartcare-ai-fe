'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

const ROLES = [
  { value: 'doctor', label: 'Doctor', color: '#60a5fa' },
  { value: 'staff', label: 'Staff / Nurse', color: '#34d399' },
  { value: 'nurse', label: 'Nurse', color: '#4ade80' },
  { value: 'technician', label: 'Technician', color: '#94a3b8' },
  { value: 'admin', label: 'Admin', color: '#c084fc' },
];

interface Props {
  onClose: () => void;
  onInvited: () => void;
}

export function InviteUserModal({ onClose, onInvited }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.inviteUser({ full_name: fullName.trim(), email: email.trim().toLowerCase(), role });
      onInvited();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to invite user. Check the email is not already registered.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: 'rgb(11,40,39)',
        border: '1px solid rgba(9,246,238,0.2)',
        borderRadius: 20, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(21,81,80,0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ color: 'rgba(9,246,238,0.5)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>
                User Management
              </p>
              <h2 style={{ color: '#e0fffe', fontSize: 18, fontWeight: 800, fontFamily: 'monospace' }}>
                Invite Team Member
              </h2>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(93,213,211,0.5)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>
              ✕
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={{ display: 'block', color: 'rgba(93,213,211,0.6)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Dr. Sarah Khan"
              required
              style={{
                width: '100%', background: 'rgba(5,20,20,0.8)',
                border: '1px solid rgba(21,81,80,0.6)', borderRadius: 10,
                padding: '10px 14px', color: '#e0fffe', fontSize: 14, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: 'rgba(93,213,211,0.6)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="doctor@hospital.com"
              required
              style={{
                width: '100%', background: 'rgba(5,20,20,0.8)',
                border: '1px solid rgba(21,81,80,0.6)', borderRadius: 10,
                padding: '10px 14px', color: '#e0fffe', fontSize: 14, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: 'rgba(93,213,211,0.6)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Role
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {ROLES.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  style={{
                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                    border: role === r.value ? `1.5px solid ${r.color}60` : '1px solid rgba(21,81,80,0.5)',
                    background: role === r.value ? `${r.color}15` : 'transparent',
                    color: role === r.value ? r.color : 'rgba(93,213,211,0.5)',
                    fontSize: 13, fontWeight: role === r.value ? 700 : 500,
                    transition: 'all 0.15s',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button
              type="submit"
              disabled={loading || !fullName.trim() || !email.trim()}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                background: loading ? 'rgba(9,246,238,0.3)' : 'linear-gradient(135deg, #36c9c5, #09f6ee)',
                color: '#051414', fontSize: 14, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Sending invite…' : 'Send Invite →'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '12px 20px', borderRadius: 12,
                border: '1px solid rgba(21,81,80,0.6)', background: 'transparent',
                color: 'rgba(93,213,211,0.5)', fontSize: 14, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>

          <p style={{ color: 'rgba(93,213,211,0.3)', fontSize: 11, textAlign: 'center' }}>
            An invite email with a set-password link will be sent to the user.
          </p>
        </form>
      </div>
    </div>
  );
}
