import { Card } from "@luminova/ui";

interface InitiativeStatCardProps {
  label: string;
  value: string;
}

export function InitiativeStatCard({ label, value }: InitiativeStatCardProps) {
  return (
    <Card padding="sm" className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
        {label}
      </span>
      <span className="text-[22px] font-semibold leading-tight tabular-nums text-ink-1">
        {value}
      </span>
    </Card>
  );
}
