interface RedFlagAlertProps {
  flags: string[];
}

export function RedFlagAlert({ flags }: RedFlagAlertProps) {
  if (flags.length === 0) return null;

  const primary = flags[0];
  const rest = flags.slice(1);

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-danger/40 bg-danger/10 px-5 py-3.5">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
        <path d="M12 9v4" /><path d="M12 17h.01" />
      </svg>
      <span className="text-[14px] font-semibold text-red-300">
        {primary}
      </span>
      {rest.map((flag) => (
        <span
          key={flag}
          className="rounded-full border border-danger/40 bg-danger/15 px-2.5 py-0.5 text-[11px] font-medium text-red-300"
        >
          {flag}
        </span>
      ))}
    </div>
  );
}
