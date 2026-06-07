import { cn } from "@luminova/ui";
import { MEMBER_STATUSES } from "@luminova/types";
import type { StatusCounts, StatusFilter } from "../lib/member-filter";

interface MemberStatusFilterProps {
  value: StatusFilter;
  counts: StatusCounts;
  onChange: (value: StatusFilter) => void;
}

const TABS: { value: StatusFilter; label: string }[] = [
  { value: "Todos", label: "Todos" },
  ...MEMBER_STATUSES.map((s) => ({ value: s, label: s })),
];

export function MemberStatusFilter({ value, counts, onChange }: MemberStatusFilterProps) {
  return (
    <div
      role="group"
      aria-label="Filtrar por estado"
      className="inline-flex items-center gap-1 rounded-pill bg-surface-2 p-1"
    >
      {TABS.map(({ value: v, label }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={cn(
              "inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-[13px] font-semibold transition-colors duration-200 ease-expo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue",
              active
                ? "bg-jci-blue text-white shadow-[0_2px_8px_-2px_rgba(0,151,215,0.5)]"
                : "text-ink-2 hover:bg-jci-blue-25/50 hover:text-jci-blue",
            )}
          >
            {label}
            <span
              className={cn(
                "rounded-pill px-1.5 py-px text-[11px] tabular-nums",
                active ? "bg-white/25 text-white" : "bg-ink-1/[0.06] text-ink-3",
              )}
            >
              {counts[v]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
