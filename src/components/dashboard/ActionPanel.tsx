import type { TriageSession } from '@/types/api';
import { CustomSelect } from '@/components/ui/CustomSelect';

interface ActionPanelProps {
  session: TriageSession;
  overrideLevel: string;
  setOverrideLevel: (v: string) => void;
  overrideReason: string;
  setOverrideReason: (v: string) => void;
  actionLoading: boolean;
  onOverride: () => void;
  onMarkSeen: () => void;
  onRemove: () => void;
  removeLoading?: boolean;
}

export function ActionPanel({
  session,
  overrideLevel,
  setOverrideLevel,
  overrideReason,
  setOverrideReason,
  actionLoading,
  onOverride,
  onMarkSeen,
  onRemove,
  removeLoading = false,
}: ActionPanelProps) {
  const isCompleted = session.status === 'COMPLETED';
  const isDisabled = actionLoading || isCompleted;

  return (
    <div className="flex flex-col gap-3">
      {/* Action buttons row */}
      <div className="flex flex-wrap gap-2.5">
        <button
          onClick={() => setOverrideLevel(overrideLevel ? '' : '1')}
          className="rounded-lg border border-danger bg-danger/15 px-5 py-2.5 text-[14px] font-semibold text-red-300 transition-colors hover:bg-danger/25"
        >
          Override CTAS
        </button>
        <button className="rounded-lg border border-orange-600 bg-orange-600/15 px-5 py-2.5 text-[14px] font-semibold text-orange-200 transition-colors hover:bg-orange-600/25">
          Escalate
        </button>
        <button className="rounded-lg border border-dash-border bg-dash-raised px-5 py-2.5 text-[14px] font-semibold text-sc-500 transition-colors hover:border-sc-700 hover:text-sc-400">
          Route to…
        </button>
        <button
          onClick={onMarkSeen}
          disabled={isDisabled}
          className={`
            rounded-lg border border-dash-border bg-dash-raised px-5 py-2.5
            text-[14px] font-semibold text-sc-500 transition-colors
            hover:border-sc-700 hover:text-sc-400
            ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}
          `}
        >
          Mark Seen
        </button>
        <button
          onClick={onRemove}
          disabled={removeLoading}
          className={`
            flex items-center gap-1.5 rounded-lg border border-danger/40 bg-danger/5
            px-5 py-2.5 text-[14px] font-semibold text-danger transition-colors
            hover:border-danger hover:bg-danger/10
            ${removeLoading ? 'cursor-not-allowed opacity-50' : ''}
          `}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
          {removeLoading ? 'Removing…' : 'Remove from Queue'}
        </button>
      </div>

      {/* Override panel (expandable) */}
      {overrideLevel && (
        <div className="flex flex-wrap items-center gap-2.5">
          <CustomSelect
            value={overrideLevel}
            onChange={(val) => setOverrideLevel(val)}
            options={[1, 2, 3, 4, 5].map((l) => ({ value: String(l), label: `CTAS ${l}` }))}
            className="w-32"
          />
          <input
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Reason"
            className="min-w-40 flex-1 rounded-lg border border-dash-border bg-dash-raised px-3 py-2 text-xs text-text-primary outline-none placeholder:text-text-dim"
          />
          <button
            onClick={onOverride}
            disabled={actionLoading}
            className={`
              rounded-lg border-none bg-danger px-5 py-2.5 text-xs
              font-semibold text-white transition-colors hover:bg-danger/80
              ${actionLoading ? 'cursor-not-allowed opacity-50' : ''}
            `}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
