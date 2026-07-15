import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-required"?: boolean;
  className?: string;
}

/**
 * Single-select pill toggle group (e.g. period/view filters). Controlled:
 * pass `value` + `onChange`. For navigational tabs that change route, use links.
 * Pass `id` + `aria-label`/`aria-labelledby` (+ `aria-required`) when it stands in
 * for a labeled form control so the group is named and its required state exposed.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  ...rest
}: SegmentedControlProps<T>) {
  return (
    <div role="group" className={cn("inline-flex gap-2", className)} {...rest}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "cursor-pointer rounded-pill px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-200 ease-expo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue",
              active
                ? "bg-jci-blue text-white"
                : "bg-ink-1/[0.05] text-ink-2 hover:bg-ink-1/[0.09]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
