'use client';

import { useRef, useEffect } from 'react';
import { getAvatarManager } from '@/lib/akool';
import type { AvatarStatus } from '@/store/booth';

interface AvatarPanelProps {
  avatarStatus: AvatarStatus;
  avatarType: 'nurse' | 'doctor';
  speechText?: string;
  onVideoRef?: (el: HTMLVideoElement | null) => void;
}

export function AvatarPanel({ avatarStatus, avatarType, speechText, onVideoRef }: AvatarPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    onVideoRef?.(el);
    getAvatarManager()?.attachVideo(el);
  }, [onVideoRef]);

  const isLive = avatarStatus === 'live';
  const isConnecting = avatarStatus === 'connecting';

  return (
    <div
      className="h-full min-h-screen flex flex-col items-center justify-end pb-10"
      style={{ background: 'linear-gradient(to bottom, #0d1a2d, #0a0f1e)' }}
    >
      <div className="relative mb-4">
        <div
          className="avatar-glow rounded-full overflow-hidden"
          style={{ width: 260, height: 340, border: '2px solid rgba(0,255,230,0.3)', position: 'relative' }}
        >
          {/* Real Agora video stream */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={false}
            className="w-full h-full object-cover"
            style={{ display: isLive ? 'block' : 'none' }}
          />

          {/* Connecting spinner */}
          {isConnecting && (
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-3"
              style={{ backgroundColor: '#1f2937', position: 'absolute', top: 0, left: 0 }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  border: '3px solid rgba(54,201,197,0.2)',
                  borderTop: '3px solid #36c9c5',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <span style={{ color: '#36c9c5', fontSize: 12, fontWeight: 600, textAlign: 'center', padding: '0 16px' }}>
                Connecting avatar…
              </span>
            </div>
          )}

          {/* Placeholder when idle */}
          {!isLive && !isConnecting && (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: '#1f2937' }}
            >
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                <circle cx="40" cy="30" r="18" fill="#36c9c5" opacity="0.6" />
                <ellipse cx="40" cy="65" rx="26" ry="16" fill="#36c9c5" opacity="0.4" />
              </svg>
            </div>
          )}
        </div>

        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: '#1f2937', color: '#36c9c5', border: '1px solid #36c9c5' }}
        >
          {avatarType === 'doctor' ? 'Dr. AI' : 'Nurse AI'}
        </div>
      </div>

      {speechText && (
        <div
          className="mx-6 mt-4 px-4 py-3 rounded-xl text-sm text-center leading-relaxed max-w-xs"
          style={{
            backgroundColor: 'rgba(31,41,55,0.9)',
            border: '1px solid rgba(54,201,197,0.3)',
            color: '#e5e7eb',
          }}
        >
          {speechText}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
