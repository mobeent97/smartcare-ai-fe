import type { AuditEvent } from '@/types/api';
import { TIMELINE_DOT_COLORS } from '@/lib/dashboard-utils';

interface SessionTimelineProps {
  events: AuditEvent[];
}

export function SessionTimeline({ events }: SessionTimelineProps) {
  if (events.length === 0) return null;

  return (
    <section className="rounded-xl border border-dash-border bg-dash-card px-6 py-5">
      <p className="mb-4 text-[13px] font-bold uppercase tracking-[0.05em] text-sc-500">
        Session Timeline
      </p>
      <div className="flex flex-col">
        {events.map((event, idx) => {
          const dotColor = TIMELINE_DOT_COLORS[event.event_type] ?? '#207976';
          const isLast = idx === events.length - 1;
          return (
            <div key={event.id} className="relative flex gap-3 pb-3 last:pb-0">
              {/* Vertical connector line */}
              {!isLast && (
                <div
                  className="absolute left-[5px] top-[14px] bottom-0 w-px"
                  style={{ backgroundColor: '#0b2827' }}
                />
              )}
              {/* Dot */}
              <span
                className="relative z-10 mt-[3px] h-[11px] w-[11px] shrink-0 rounded-full"
                style={{ backgroundColor: dotColor }}
              />
              {/* Content */}
              <div className="flex items-baseline gap-2">
                <span className="w-[70px] shrink-0 font-mono text-[13px] text-sc-500">
                  {new Date(event.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="text-[14px] text-[#aeeae9]">
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
