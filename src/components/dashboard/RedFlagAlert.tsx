interface RedFlagAlertProps {
  flags: string[];
}

export function RedFlagAlert({ flags }: RedFlagAlertProps) {
  const hasChestPain = flags.some((f) => /chest|cardiac|pain/i.test(f));

  if (flags.length === 0 && !hasChestPain) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* Chest-pain alert banner */}
      {hasChestPain && (
        <section className="flex items-center gap-2.5 rounded-[10px] border border-danger/35 bg-danger/10 px-5 py-3">
          <span className="text-base">⚠️</span>
          <span className="text-sm">🚨</span>
          <span className="text-[13px] font-semibold text-danger brightness-150">
            Active Chest Pain — cardiac protocol engaged
          </span>
        </section>
      )}

      {/* Red flags */}
      {flags.length > 0 && (
        <section className="rounded-xl border border-danger/35 bg-dash-card p-4">
          <p className="mb-2 text-[11px] font-bold uppercase text-text-muted">
            Red Flags
          </p>
          <div className="flex flex-wrap gap-2">
            {flags.map((flag) => (
              <span
                key={flag}
                className="rounded-full border border-danger/40 bg-danger/15 px-2.5 py-[3px] text-xs text-danger brightness-150"
              >
                {flag}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
