import { splitReasoning } from '@/lib/dashboard-utils';

interface TriageReasoningProps {
  summary: string | null;
}

export function TriageReasoning({ summary }: TriageReasoningProps) {
  const bullets = splitReasoning(summary);

  return (
    <section className="rounded-xl border border-dash-border bg-dash-card p-5 lg:px-6">
      <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.08em] text-sc-500">
        Triage Reasoning
      </p>
      {bullets.length === 0 ? (
        <p className="text-[13px] text-text-dim">
          Reasoning will appear once triage completes.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {bullets.map((b, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 text-sm leading-relaxed text-sc-500">
                ›
              </span>
              <span className="text-[13px] leading-relaxed text-text-secondary">
                {b}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
