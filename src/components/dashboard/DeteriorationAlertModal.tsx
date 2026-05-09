import type { DeteriorationAlert } from '@/types/api';

interface Props {
  alert: DeteriorationAlert;
  onView: () => void;
  onDismiss: () => void;
}

export function DeteriorationAlertModal({ alert, onView, onDismiss }: Props) {
  const patientLabel = alert.patientName ?? `#${alert.sessionId.slice(-6).toUpperCase()}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-6 pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-sm rounded-2xl border-2 p-6 shadow-2xl"
        style={{
          background: 'rgb(11, 40, 39)',
          borderColor: 'rgba(251,146,60,0.6)',
          boxShadow: '0 0 40px rgba(251,146,60,0.15)',
        }}
      >
        {/* Header */}
        <div className="mb-4 flex items-start gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl"
            style={{ background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.4)' }}
          >
            ⚠️
          </div>
          <div>
            <p className="text-[13px] font-bold uppercase tracking-wider" style={{ color: '#fb923c' }}>
              Patient Deteriorating
            </p>
            <p className="text-[15px] font-bold text-text-primary">
              {patientLabel}
            </p>
          </div>
        </div>

        {/* CTAS change */}
        <div
          className="mb-3 flex items-center justify-between rounded-xl px-4 py-3"
          style={{ background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.2)' }}
        >
          <div className="text-center">
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Was</p>
            <p className="text-[22px] font-black" style={{ color: 'rgba(251,146,60,0.6)' }}>
              CTAS {alert.oldCtas}
            </p>
          </div>
          <div style={{ color: '#fb923c', fontSize: 20 }}>→</div>
          <div className="text-center">
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Now</p>
            <p className="text-[22px] font-black" style={{ color: '#fb923c' }}>
              CTAS {alert.newCtas}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Wait</p>
            <p className="text-[18px] font-bold text-text-primary">{alert.waitMinutes}m</p>
          </div>
        </div>

        {/* Reason */}
        <p className="mb-4 text-[12px] leading-relaxed text-text-secondary">
          {alert.reason}
        </p>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onView}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold transition-all"
            style={{ background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.5)', color: '#fb923c' }}
          >
            View Patient
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold text-text-muted transition-colors hover:text-text-secondary"
            style={{ border: '1px solid rgba(21,81,80,0.6)', background: 'transparent' }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
