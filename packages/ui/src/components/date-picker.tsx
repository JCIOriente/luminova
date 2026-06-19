import { useState, type ReactNode } from "react";
import { Root, Trigger, Portal, Content } from "@radix-ui/react-popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "../lib/cn";
import { fieldControlClasses } from "./input";
import { Icon } from "./icons";
import { Calendar } from "./calendar";
import {
  formatISODate,
  formatISODateTime,
  parseISODate,
  parseISODateTime,
} from "./date-picker-utils";

interface BasePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const panelClasses =
  "pointer-events-auto z-50 rounded-card border border-line bg-surface p-3 shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)]";

/** Dropdown-caption span: a century back (covers birthdates) to a decade ahead. */
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_BOUNDS = {
  startMonth: new Date(CURRENT_YEAR - 100, 0),
  endMonth: new Date(CURRENT_YEAR + 10, 11),
} as const;

/** Shared trigger + calendar-popover shell for both pickers. */
function BasePicker({
  id,
  label,
  placeholder,
  disabled,
  selected,
  closeOnSelect,
  onDaySelect,
  children,
}: {
  id?: string;
  label: string | null;
  placeholder: string;
  disabled?: boolean;
  selected: Date | undefined;
  closeOnSelect: boolean;
  onDaySelect: (date: Date) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Root open={open} onOpenChange={setOpen}>
      <Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            fieldControlClasses,
            "flex items-center justify-between gap-2 text-left disabled:opacity-60",
            !label && "text-ink-3",
          )}
        >
          <span className="truncate">{label ?? placeholder}</span>
          <span className="shrink-0 text-ink-2">{Icon.calendar({ s: 18 })}</span>
        </button>
      </Trigger>
      <Portal>
        <Content
          align="start"
          sideOffset={6}
          role="dialog"
          aria-label="Calendario"
          className={panelClasses}
        >
          <Calendar
            mode="single"
            captionLayout="dropdown"
            {...YEAR_BOUNDS}
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              if (!date) return;
              onDaySelect(date);
              if (closeOnSelect) setOpen(false);
            }}
          />
          {children}
        </Content>
      </Portal>
    </Root>
  );
}

/** Date picker (no time). Value in/out is a `yyyy-MM-dd` string. */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Seleccionar fecha…",
  disabled,
}: BasePickerProps) {
  const selected = parseISODate(value);
  const label = selected ? format(selected, "d 'de' MMM yyyy", { locale: es }) : null;
  return (
    <BasePicker
      id={id}
      label={label}
      placeholder={placeholder}
      disabled={disabled}
      selected={selected}
      closeOnSelect
      onDaySelect={(date) => onChange(formatISODate(date))}
    />
  );
}

/** Date + time picker. Value in/out is a `yyyy-MM-ddTHH:mm` string. */
export function DateTimePicker({
  id,
  value,
  onChange,
  placeholder = "Seleccionar fecha y hora…",
  disabled,
}: BasePickerProps) {
  const selected = parseISODateTime(value);
  const label = selected ? format(selected, "d 'de' MMM yyyy, HH:mm", { locale: es }) : null;
  const timeValue = selected ? format(selected, "HH:mm") : "";
  return (
    <BasePicker
      id={id}
      label={label}
      placeholder={placeholder}
      disabled={disabled}
      selected={selected}
      closeOnSelect={false}
      onDaySelect={(date) => {
        const base = selected ?? new Date();
        const stamped = new Date(date);
        stamped.setHours(base.getHours(), base.getMinutes(), 0, 0);
        onChange(formatISODateTime(stamped));
      }}
    >
      <div className="mt-2 flex items-center gap-2 border-t border-line pt-3">
        <label htmlFor={`${id ?? "datetime"}-time`} className="text-[13px] font-medium text-ink-2">
          Hora
        </label>
        <input
          id={`${id ?? "datetime"}-time`}
          type="time"
          value={timeValue}
          disabled={!selected}
          onChange={(event) => {
            if (!selected) return;
            const [h, m] = event.target.value.split(":");
            if (h === undefined || m === undefined) return;
            const next = new Date(selected);
            next.setHours(Number(h), Number(m), 0, 0);
            onChange(formatISODateTime(next));
          }}
          className="h-10 flex-1 rounded-[8px] border-[1.5px] border-line-strong bg-surface px-3 text-base text-ink-1 focus:border-jci-blue focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3"
        />
      </div>
    </BasePicker>
  );
}
