'use client';

import type { AvatarStatus } from '@/store/booth';

// Static nurse card for the step-by-step booth pages. There is no streaming
// avatar behind it any more — the booth's voice lives in the realtime page.

interface AvatarPanelProps {
  avatarStatus: AvatarStatus;
  avatarType: 'nurse' | 'doctor';
  speechText?: string;
}

export function AvatarPanel({ avatarStatus, avatarType, speechText }: AvatarPanelProps) {
  const isConnecting = avatarStatus === 'connecting';

  return (
    <div
      className="h-full flex flex-col items-center justify-end md:min-h-screen pt-6 pb-6 md:pb-10 safe-top"
      style={{ background: 'linear-gradient(to bottom, #0d1a2d, #0a0f1e)' }}
    >
      <div className="relative mb-4">
        <div
          className="avatar-glow rounded-full overflow-hidden"
          style={{
            width: 'min(260px, 46vw)',
            height: 'min(340px, 60vw)',
            border: '2px solid rgba(0,255,230,0.3)',
            position: 'relative',
          }}
        >
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
                Connecting…
              </span>
            </div>
          )}

          {/* Placeholder when idle */}
          {!isConnecting && (
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
