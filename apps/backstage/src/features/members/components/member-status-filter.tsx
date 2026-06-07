import { SegmentedControl, type SegmentedOption } from "@luminova/ui";
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
  const options: SegmentedOption<StatusFilter>[] = TABS.map(({ value: v, label }) => ({
    value: v,
    label: (
      <span className="inline-flex items-center gap-1.5">
        {label}
        <span className="tabular-nums opacity-70">{counts[v]}</span>
      </span>
    ),
  }));

  return (
    <SegmentedControl
      aria-label="Filtrar por estado"
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}
