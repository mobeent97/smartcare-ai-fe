interface Alert {
  sessionId: string;
  redFlags: string[];
}

interface Props {
  alert: Alert;
  onView: () => void;
  onDismiss: () => void;
}

export function EmergencyAlertModal({ alert, onView, onDismiss }: Props) {
  return (
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
          Session: #{alert.sessionId.slice(-6).toUpperCase()}
        </p>
        {alert.redFlags.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center my-4">
            {alert.redFlags.map((flag) => (
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
            onClick={onView}
            className="flex-1 rounded-xl font-bold"
            style={{ backgroundColor: '#dc2626', color: '#fff', padding: '12px 0', border: 'none', fontSize: 15 }}
          >
            View Patient
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 rounded-xl font-bold"
            style={{ backgroundColor: '#1f2937', color: '#9ca3af', padding: '12px 0', border: '1px solid #374151', fontSize: 15 }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
