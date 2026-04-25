import type { TriageAnswer } from '@/types/api';
import { STEP_LABELS } from '@/lib/dashboard-utils';

interface AnswerListProps {
  answers: TriageAnswer[];
}

function answerColor(answer: TriageAnswer): string {
  const raw = answer.raw_input?.toLowerCase().trim() ?? '';
  const step = answer.step_name;

  if (step === 'first_look') {
    return raw === 'yes' || raw === 'true' || raw === '1'
      ? 'text-danger'
      : 'text-success';
  }
  if (step === 'complaint') return 'text-sc-400';

  if (step === 'symptom_detail') {
    const pain = answer.parsed_data?.pain_scale_numeric as number | undefined;
    if (pain != null) {
      if (pain >= 7) return 'text-danger';
      if (pain >= 4) return 'text-orange-400';
      return 'text-success';
    }
  }

  if (!raw || raw === 'skipped' || raw === 'n/a') return 'text-text-dim';
  return 'text-text-primary';
}

function stepLabel(answer: TriageAnswer): string {
  return (
    STEP_LABELS[answer.step_name] ??
    answer.step_name.replace(/_/g, ' ')
  );
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
    <div className="divide-y divide-dash-border/40">
      {answers.map((answer, idx) => (
        <div
          key={answer.id ?? idx}
          className="flex items-start gap-6 py-3.5 first:pt-0 last:pb-0"
        >
          {/* Step label */}
          <span className="w-44 shrink-0 pt-px text-[11px] uppercase tracking-[0.07em] text-text-dim">
            {stepLabel(answer)}
          </span>

          {/* Answer content */}
          <div className="flex flex-1 flex-col gap-1.5">
            <span className={`text-[14px] font-semibold leading-snug ${answerColor(answer)}`}>
              {answer.raw_input || <span className="italic text-text-dim">—</span>}
            </span>
            {Object.keys(answer.parsed_data ?? {}).length > 0 && (
              <details>
                <summary className="cursor-pointer text-[11px] text-text-dim hover:text-text-muted">
                  Parsed data
                </summary>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-text-muted">
                  {JSON.stringify(answer.parsed_data, null, 2)}
                </pre>
              </details>
            )}
          </div>

          {/* Step index pill */}
          <span className="mt-0.5 shrink-0 rounded-full bg-dash-raised px-2 py-0.5 text-[10px] font-semibold text-text-dim">
            {String(idx + 1).padStart(2, '0')}
          </span>
        </div>
      ))}
    </div>
  );
}
