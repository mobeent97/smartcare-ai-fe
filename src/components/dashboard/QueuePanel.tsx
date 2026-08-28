'use client';

import { PatientListCard } from '@/components/dashboard/PatientListCard';
import { priorityScore } from '@/lib/dashboard-utils';
import type { TriageSession } from '@/types/api';
import { CustomSelect } from '@/components/ui/CustomSelect';
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
  /** Phone only: the case detail is showing, so hide the list. */
  hiddenOnMobile?: boolean;
  queue: TriageSession[];
  selectedCaseId: string | null;
  onSelectCase: (id: string) => void;
}

export function QueuePanel({
  queue,
  selectedCaseId,
  onSelectCase,
  hiddenOnMobile = false,
}: QueuePanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const sorted = useMemo(() => sortPatients(queue, sortKey), [queue, sortKey]);

  return (
    <aside
      className={
        // Phone: the list owns the whole screen, because a 312px rail leaves
        // ~128px for the case detail and every label wraps to one word per
        // line. Desktop keeps the fixed rail beside the detail.
        'flex flex-col border-dash-border bg-dash-surface ' +
        'w-full border-r-0 md:w-[312px] md:shrink-0 md:border-r ' +
        (hiddenOnMobile ? 'hidden md:flex' : 'flex')
      }
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 border-b border-dash-border/50 px-5 py-4">
        <span className="text-[14px] font-bold text-text-primary">Active Patients</span>
        <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
          {queue.length}
        </span>
      </div>

      {/* ── Sort selector ──────────────────────────────── */}
      <div className="border-b border-dash-border/50 px-4 py-2.5">
        <CustomSelect
          value={sortKey}
          onChange={(val) => setSortKey(val as SortKey)}
          options={[
            { value: 'priority', label: '↕ Sort by Priority' },
            { value: 'wait', label: '↕ Sort by Wait time' },
            { value: 'arrived', label: '↕ Sort by Newest' }
          ]}
        />
      </div>

      {/* ── Scrollable patient list ────────────────────── */}
      <div className="tabbar-inset flex flex-1 flex-col gap-2 overflow-y-auto p-3.5">
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
