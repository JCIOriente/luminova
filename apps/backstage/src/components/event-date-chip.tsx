/** Calendar chip (month + day) shared by the dashboard and member-panel event lists. */
export function EventDateChip({ month, day }: { month: string; day: string }) {
  return (
    <div className="flex size-[52px] shrink-0 flex-col items-center justify-center rounded-[11px] border border-line bg-surface-2">
      <span className="text-ui-2xs font-bold tracking-[0.1em] text-jci-blue uppercase">
        {month}
      </span>
      <span className="text-[21px] leading-none font-medium tracking-[-0.02em] text-ink-1">
        {day}
      </span>
    </div>
  );
}
