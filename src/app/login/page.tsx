'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function LoginPage() {
  const router = useRouter();
  const { setTokens, setUserEmail } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setTokens(res.data.access, res.data.refresh);
      setUserEmail(email);
      router.push('/dashboard');
    } catch {
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: '#0a0f1e' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ backgroundColor: '#111827', border: '1px solid #374151' }}
      >
        <div className="text-center mb-8">
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#36c9c5' }}>Smart Care AI</h1>
          <p style={{ color: '#9ca3af', marginTop: 4, fontSize: 14 }}>Clinician Dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label style={{ color: '#9ca3af', fontSize: 13, fontWeight: 600 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full mt-1 rounded-xl px-4 py-3"
              style={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                color: '#f9fafb',
                fontSize: 15,
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ color: '#9ca3af', fontSize: 13, fontWeight: 600 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full mt-1 rounded-xl px-4 py-3"
              style={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                color: '#f9fafb',
                fontSize: 15,
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <p style={{ color: '#fca5a5', fontSize: 13, textAlign: 'center' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: '#36c9c5',
              color: '#0a0f1e',
              padding: '14px 0',
              fontSize: 16,
              fontWeight: 700,
              border: 'none',
              marginTop: 4,
              minHeight: 52,
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
