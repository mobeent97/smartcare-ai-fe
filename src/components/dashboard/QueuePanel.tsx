'use client';

import { PatientListCard } from '@/components/dashboard/PatientListCard';
import { priorityScore } from '@/lib/dashboard-utils';
import type { TriageSession } from '@/types/api';
import { useState, useMemo } from 'react';

type SortKey = 'priority' | 'arrived' | 'wait';

function sortPatients(queue: TriageSession[], key: SortKey): TriageSession[] {
  const copy = [...queue];
  if (key === 'priority') {
    return copy.sort((a, b) => priorityScore(b) - priorityScore(a));
  }
  if (key === 'wait') {
    return copy.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }
  return copy.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

interface QueuePanelProps {
  queue: TriageSession[];
  selectedCaseId: string | null;
  onSelectCase: (id: string) => void;
}

export function QueuePanel({
  queue,
  selectedCaseId,
  onSelectCase,
}: QueuePanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const sorted = useMemo(() => sortPatients(queue, sortKey), [queue, sortKey]);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-dash-border bg-dash-surface">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-dash-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-text-primary">
            Active Patients
          </span>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sc-500 text-[10px] font-extrabold text-dash-bg">
            {queue.length}
          </span>
        </div>
      </div>

      {/* ── Sort selector ──────────────────────────────── */}
      <div className="border-b border-dash-border/50 px-3 py-2">
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="w-full rounded-lg border border-dash-border bg-transparent px-2.5 py-1.5 text-[11px] text-sc-500 outline-none"
        >
          <option value="priority">↕ Sort by Priority</option>
          <option value="wait">↕ Sort by Wait time</option>
          <option value="arrived">↕ Sort by Newest</option>
        </select>
      </div>

      {/* ── Scrollable patient list ────────────────────── */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-text-dim">
            No patients in queue
          </div>
        ) : (
          sorted.map((s) => (
            <PatientListCard
              key={s.id}
              session={s}
              selected={s.id === selectedCaseId}
              onClick={() => onSelectCase(s.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
