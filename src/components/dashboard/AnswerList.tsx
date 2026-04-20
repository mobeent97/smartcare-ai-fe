import type { TriageAnswer } from '@/types/api';
import { STEP_LABELS } from '@/lib/dashboard-utils';

interface AnswerListProps {
  answers: TriageAnswer[];
}

export function AnswerList({ answers }: AnswerListProps) {
  if (!answers || answers.length === 0) {
    return (
      <p className="pt-8 text-center text-[13px] text-text-dim">
        No answers recorded yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {answers.map((answer) => (
        <div
          key={answer.id}
          className="rounded-xl border border-dash-border bg-dash-card p-4"
        >
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-sc-500">
            {STEP_LABELS[answer.step_name] ??
              answer.step_name.replace(/_/g, ' ').toUpperCase()}
          </p>
          <p className="text-sm leading-relaxed text-text-primary">
            {answer.raw_input}
          </p>
          {Object.keys(answer.parsed_data).length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-text-dim hover:text-text-muted">
                AI parsed data
              </summary>
              <pre className="mt-1.5 whitespace-pre-wrap font-mono text-[11px] text-text-muted">
                {JSON.stringify(answer.parsed_data, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
