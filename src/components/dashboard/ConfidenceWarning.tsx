interface ConfidenceWarningProps {
  answersCount: number;
}

export function ConfidenceWarning({ answersCount }: ConfidenceWarningProps) {
  return (
    <section className="flex items-center gap-3 rounded-xl border border-dash-border bg-dash-card px-5 py-3.5">
      <span className="text-lg leading-none">⚠️</span>
      <span className="text-[15px] font-medium text-[#fde68a]">
        Medium Confidence — {answersCount}{' '}
        {answersCount === 1 ? 'question' : 'questions'} skipped
      </span>
    </section>
  );
}
