interface InitiativeStatCardProps {
  label: string;
  value: string;
}

export function InitiativeStatCard({ label, value }: InitiativeStatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
        {label}
      </span>
      <span className="text-[22px] font-semibold leading-tight tabular-nums text-ink-1">
        {value}
      </span>
    </div>
  );
}
