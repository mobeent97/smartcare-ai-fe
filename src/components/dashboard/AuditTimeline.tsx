import type { AuditEvent } from '@/types/api';
import { AUDIT_COLORS } from '@/lib/dashboard-utils';

interface AuditTimelineProps {
  events: AuditEvent[];
}

export function AuditTimeline({ events }: AuditTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="pt-8 text-center text-[13px] text-text-dim">
        No audit events recorded yet.
      </p>
    );
  }

  return (
    <div className="relative">
      {/* Vertical tracking line */}
      <div className="absolute bottom-1 left-2.5 top-1 w-px bg-dash-border" />
      
      <div className="flex flex-col gap-3 pl-8">
        {events.map((event) => {
          const colorClass = AUDIT_COLORS[event.event_type] ?? '#2aa2a0';
          
          return (
            <div key={event.id} className="relative">
              {/* Dot */}
              <div
                className="absolute left-[-26px] top-1.5 h-3 w-3 rounded-full"
                style={{ backgroundColor: colorClass }}
              />
              
              {/* Card */}
              <div className="rounded-xl border border-dash-border bg-dash-card p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wide"
                    style={{ color: colorClass }}
                  >
                    {event.event_type.replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-[11px] text-text-dim">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-[13px] text-text-secondary">
                  {event.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
