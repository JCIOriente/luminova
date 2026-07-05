import { SegmentedControl } from "@luminova/ui";
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
    <SegmentedControl
      aria-label="Filtrar por estado"
      value={value}
      onChange={onChange}
      options={TABS.map(({ value: v, label }) => ({
        value: v,
        label: (
          <>
            {label}
            <span className="ml-1.5 text-[11px] font-semibold opacity-70 tabular-nums">
              {counts[v]}
            </span>
          </>
        ),
      }))}
    />
  );
}
