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
}: ActionPanelProps) {
  const isCompleted = session.status === 'COMPLETED';
  const isDisabled = actionLoading || isCompleted;

  return (
    <div className="flex flex-col gap-3">
      {/* Action buttons row */}
      <div className="flex flex-wrap gap-2.5">
        <button
          onClick={() => setOverrideLevel(overrideLevel ? '' : '1')}
          className="rounded-lg border border-ctas-1 bg-transparent px-4 py-2 text-xs font-semibold text-ctas-1/70 transition-colors hover:bg-ctas-1/10"
        >
          Override CTAS
        </button>
        <button className="rounded-lg border border-sc-500 bg-sc-500 px-4 py-2 text-xs font-semibold text-dash-bg transition-colors hover:bg-sc-400">
          Escalate
        </button>
        <button className="rounded-lg border border-dash-border bg-transparent px-4 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-sc-700 hover:text-sc-400">
          Route to…
        </button>
        <button
          onClick={onMarkSeen}
          disabled={isDisabled}
          className={`
            rounded-lg border border-dash-border bg-transparent px-4 py-2
            text-xs font-semibold text-text-secondary transition-colors
            hover:border-sc-700 hover:text-sc-400
            ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}
          `}
        >
          Mark Seen
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
              rounded-lg border-none bg-danger px-4 py-2 text-xs
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
