interface ConfidenceWarningProps {
  answersCount: number;
}

export function ConfidenceWarning({ answersCount }: ConfidenceWarningProps) {
  return (
    <section className="flex items-center gap-2.5 rounded-[10px] border border-warning/30 bg-warning/10 px-5 py-3">
      <span className="text-base">⚠️</span>
      <span className="text-[13px] font-semibold text-warning/90 brightness-110">
        Medium Confidence — {answersCount}{' '}
        {answersCount === 1 ? 'question' : 'questions'} skipped
      </span>
    </section>
  );
}
