'use client';

export interface HelpRequest {
  sessionId: string;
  patientName: string | null;
  reason: string;
}

interface Props {
  alert: HelpRequest;
  onView: () => void;
  onDismiss: () => void;
}

/**
 * A patient in the booth asked for a person. Deliberately calmer than the
 * CTAS 1 emergency modal — amber, no pulse, no siren glyph — so staff can
 * tell the two apart at a glance across the room.
 */
export function HelpRequestModal({ alert, onView, onDismiss }: Props) {
  const who = alert.patientName || `Patient ${alert.sessionId.slice(0, 8)}`;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 md:items-center">
      <div
        className="w-full max-w-md rounded-2xl border-2 bg-dash-card p-6 md:p-8"
        style={{ borderColor: 'rgba(245,158,11,0.7)' }}
        role="alertdialog"
        aria-labelledby="help-title"
      >
        <div className="mb-4 flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </span>
          <div>
            <h2 id="help-title" className="text-lg font-extrabold text-text-primary">
              Patient needs assistance
            </h2>
            <p className="text-[13px] text-text-muted">{who} pressed “Call for help” in the booth</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row">
          <button
            onClick={onView}
            className="min-h-11 flex-1 rounded-xl px-4 font-bold text-dash-bg"
            style={{ background: '#f59e0b' }}
          >
            Open case
          </button>
          <button
            onClick={onDismiss}
            className="min-h-11 flex-1 rounded-xl border px-4 font-semibold text-text-primary"
            style={{ borderColor: 'rgba(21,81,80,0.8)', background: 'transparent' }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
