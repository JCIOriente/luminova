import type { ComponentProps } from "react";
import { DayPicker } from "react-day-picker";
import { es } from "date-fns/locale";
import { cn } from "../lib/cn";
import { Icon } from "./icons";

type CalendarProps = ComponentProps<typeof DayPicker>;

const DEFAULT_CLASS_NAMES: CalendarProps["classNames"] = {
  months: "flex flex-col",
  month: "flex flex-col gap-3",
  month_caption: "flex h-9 items-center justify-center px-9",
  caption_label:
    "inline-flex h-9 items-center gap-1 rounded-[8px] border-[1.5px] border-line-strong bg-surface pl-3 pr-2 text-[14px] font-medium capitalize text-ink-1",
  dropdowns: "flex items-center gap-2",
  dropdown_root:
    "relative inline-flex focus-within:[&>span]:border-jci-blue",
  dropdown:
    "absolute inset-0 z-10 size-full cursor-pointer appearance-none opacity-0 focus-visible:outline-none",
  nav: "absolute inset-x-0 top-0 flex h-9 items-center justify-between",
  button_previous:
    "flex size-8 items-center justify-center rounded-[8px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1 disabled:opacity-40",
  button_next:
    "flex size-8 items-center justify-center rounded-[8px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1 disabled:opacity-40",
  month_grid: "w-full border-collapse",
  weekdays: "flex",
  weekday: "w-9 text-[12px] font-medium capitalize text-ink-3",
  week: "mt-1 flex",
  day: "size-9 p-0 text-center",
  day_button:
    "flex size-9 items-center justify-center rounded-[8px] text-[14px] text-ink-1 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jci-blue/40 aria-selected:bg-jci-blue aria-selected:font-semibold aria-selected:text-white aria-selected:hover:bg-jci-blue",
  today: "[&>button]:font-semibold [&>button]:text-jci-blue aria-selected:[&>button]:text-white",
  outside: "[&>button]:text-ink-3 [&>button]:opacity-50",
  disabled: "[&>button]:cursor-not-allowed [&>button]:opacity-30 [&>button]:hover:bg-transparent",
  hidden: "invisible",
};

function CalendarChevron({ orientation }: { orientation?: "left" | "right" | "up" | "down" }) {
  return (
    <span
      className={cn(
        orientation === "left" && "rotate-180",
        orientation === "down" && "rotate-90",
        orientation === "up" && "-rotate-90",
      )}
    >
      {Icon.chevRight({ s: 18 })}
    </span>
  );
}

const CALENDAR_COMPONENTS: CalendarProps["components"] = { Chevron: CalendarChevron };

/**
 * react-day-picker wrapped with JCI tokens — no vendored stylesheet, layout and
 * chrome are fully driven by `classNames` (Tailwind), the same approach shadcn uses.
 * Spanish locale (week starts Monday) by default.
 */
export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      locale={es}
      showOutsideDays={showOutsideDays}
      className={cn("select-none", className)}
      classNames={{ ...DEFAULT_CLASS_NAMES, ...classNames }}
      components={CALENDAR_COMPONENTS}
      {...props}
    />
  );
}
