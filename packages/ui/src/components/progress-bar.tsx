import { cn } from "../lib/cn";

interface ProgressBarProps {
  value: number;
  label?: string;
  className?: string;
}

/** Pass `label` (or wrap with an external `aria-labelledby`) so the bar has an accessible name. */
export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-pill bg-ink-1/[0.07]", className)}
    >
      <div
        className="h-full rounded-pill bg-jci-blue transition-[width] duration-500 ease-expo motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
