interface AvatarPanelProps {
  isLive: boolean;
  avatarType: 'nurse' | 'doctor';
  speechText?: string;
}

export function AvatarPanel({ isLive, avatarType, speechText }: AvatarPanelProps) {
  return (
    <div
      className="h-full min-h-screen flex flex-col items-center justify-end pb-10"
      style={{ background: 'linear-gradient(to bottom, #0d1a2d, #0a0f1e)' }}
    >
      {/* Avatar ring glow */}
      <div className="relative mb-4">
        <div
          className="avatar-glow rounded-full overflow-hidden"
          style={{ width: 260, height: 340, border: '2px solid rgba(0,255,230,0.3)' }}
        >
          {isLive ? (
            /* TODO: Replace with Agora RTC video element when AGORA_APP_ID is configured */
            <div
              className="w-full h-full flex items-center justify-center text-sm"
              style={{ backgroundColor: '#1f2937', color: '#36c9c5' }}
            >
              Avatar stream active
            </div>
          ) : (
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
    </div>
  );
}
