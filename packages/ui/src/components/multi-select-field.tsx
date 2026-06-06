import { useState } from "react";
import { Command } from "cmdk";
import { Root, Trigger, Portal, Content } from "@radix-ui/react-popover";
import { cn } from "../lib/cn";
import { fieldControlClasses } from "./input";
import { Icon } from "./icons";
import type { ComboboxOption } from "./combobox";
import { removeValue, selectedOptions, toggleValue } from "./multi-select";

interface MultiSelectProps {
  options: ComboboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
}

/** Multi-select + search on Radix Popover + cmdk; selected render as removable chips. */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  emptyText = "Sin resultados",
  disabled,
  id,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const chosen = selectedOptions(options, value);

  return (
    <Root open={open} onOpenChange={setOpen}>
      <Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            fieldControlClasses,
            "flex min-h-[52px] flex-wrap items-center gap-1.5 text-left disabled:opacity-60",
          )}
        >
          {chosen.length === 0 && <span className="text-ink-3">{placeholder}</span>}
          {chosen.map((o) => (
            <span
              key={o.value}
              className="inline-flex items-center gap-1 rounded-pill bg-surface-2 py-1 pl-2.5 pr-1.5 text-sm text-ink-1"
            >
              {o.label}
              <span
                role="button"
                aria-label={`Quitar ${o.label}`}
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(removeValue(value, o.value));
                }}
                className="grid size-4 place-items-center rounded-full text-ink-2 hover:bg-line hover:text-ink-1"
              >
                {Icon.close({ s: 12 })}
              </span>
            </span>
          ))}
          <span className="ml-auto shrink-0 text-ink-2">{Icon.chevExpand({ s: 16 })}</span>
        </button>
      </Trigger>
      <Portal>
        <Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-card border border-line bg-surface p-1 shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)]"
        >
          <Command className="flex flex-col gap-1">
            <div className="flex items-center gap-2 border-b border-line px-2 pb-2 pt-1 text-ink-2">
              {Icon.search({ s: 16 })}
              <Command.Input
                placeholder={searchPlaceholder}
                className="w-full bg-transparent py-1 text-base text-ink-1 outline-none placeholder:text-ink-3"
              />
            </div>
            <Command.List className="max-h-60 overflow-y-auto py-1">
              <Command.Empty className="px-3 py-2 text-sm text-ink-3">{emptyText}</Command.Empty>
              {options.map((o) => {
                const checked = value.includes(o.value);
                return (
                  <Command.Item
                    key={o.value}
                    value={o.label}
                    disabled={o.disabled}
                    onSelect={() => onChange(toggleValue(value, o.value))}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-base text-ink-1 data-[selected=true]:bg-surface-2 data-[disabled=true]:opacity-50"
                  >
                    <span className="truncate">{o.label}</span>
                    {checked && <span className="text-jci-blue">{Icon.check({ s: 16 })}</span>}
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        </Content>
      </Portal>
    </Root>
  );
}
