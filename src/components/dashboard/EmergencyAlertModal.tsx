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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="ctas-pulse mx-4 w-full max-w-md rounded-2xl border-[3px] border-danger bg-dash-card p-8">
        <div className="mb-4 text-center">
          <span className="text-[40px]">🚨</span>
          <h2 className="mt-2 text-2xl font-extrabold text-danger">
            CTAS 1 EMERGENCY
          </h2>
        </div>
        <p className="mb-2 text-center text-[15px] text-text-primary">
          Patient requires immediate resuscitation
        </p>
        <p className="mb-1 text-center text-[13px] text-text-muted">
          Session: #{alert.sessionId.slice(-6).toUpperCase()}
        </p>
        
        {alert.redFlags.length > 0 && (
          <div className="my-4 flex flex-wrap justify-center gap-2">
            {alert.redFlags.map((flag) => (
              <span
                key={flag}
                className="rounded-full border border-danger/50 bg-danger/20 px-2.5 py-0.5 text-xs text-danger brightness-150"
              >
                {flag}
              </span>
            ))}
          </div>
        )}
        
        <div className="mt-6 flex gap-3">
          <button
            onClick={onView}
            className="flex-1 rounded-xl bg-danger py-3 text-[15px] font-bold text-white transition-colors hover:bg-danger/80"
          >
            View Patient
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 rounded-xl border border-dash-border bg-dash-bg py-3 text-[15px] font-bold text-text-muted transition-colors hover:border-sc-700 hover:text-sc-400"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

