import type { AuditEvent } from '@/types/api';
import { TIMELINE_DOT_COLORS } from '@/lib/dashboard-utils';

interface SessionTimelineProps {
  events: AuditEvent[];
}

export function SessionTimeline({ events }: SessionTimelineProps) {
  if (events.length === 0) return null;

  return (
    <section className="rounded-xl border border-dash-border bg-dash-card p-5 lg:px-6">
      <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.08em] text-sc-500">
        Session Timeline
      </p>
      <div className="flex flex-col gap-3">
        {events.map((event) => {
          const dotColor = TIMELINE_DOT_COLORS[event.event_type] ?? 'bg-text-dim';
          return (
            <div key={event.id} className="flex items-start gap-3">
              {/* Dot */}
              <span
                className="mt-[7px] h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: TIMELINE_DOT_COLORS[event.event_type] ?? '#207976' }}
              />
              {/* Content */}
              <div className="flex items-center gap-3">
                <span className="w-[65px] font-mono text-[11px] font-medium text-text-muted">
                  {new Date(event.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="text-[13px] text-text-secondary">
                  {event.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
