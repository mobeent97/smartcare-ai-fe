'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Props {
  sessionId: string;
}

export function EmergencyFab({ sessionId }: Props) {
  const router = useRouter();
  const [triggered, setTriggered] = useState(false);

  async function handleEmergency() {
    if (triggered) return;
    setTriggered(true);
    try {
      await api.submitAnswer(sessionId, 'first_look', 'yes');
    } catch { /* navigate regardless — patient safety over API errors */ }
    router.push(`/booth/${sessionId}/emergency`);
  }

  return (
    <button
      onClick={handleEmergency}
      disabled={triggered}
      aria-label="Emergency — call for immediate help"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 100,
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: triggered ? 'rgba(220,38,38,0.5)' : '#dc2626',
        border: '3px solid rgba(255,255,255,0.25)',
        cursor: triggered ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 2,
        boxShadow: triggered ? 'none' : '0 0 0 0 rgba(220,38,38,0.5)',
        animation: triggered ? 'none' : 'emergency-pulse 2s ease-out infinite',
        transition: 'background 0.2s',
      }}
    >
      <style>{`
        @keyframes emergency-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(220,38,38,0.6); }
          70%  { box-shadow: 0 0 0 14px rgba(220,38,38,0); }
          100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
        }
      `}</style>
      <span style={{ fontSize: 20, lineHeight: 1 }}>🚨</span>
      <span style={{ fontSize: 8, fontWeight: 900, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {triggered ? '...' : 'SOS'}
      </span>
    </button>
  );
}
