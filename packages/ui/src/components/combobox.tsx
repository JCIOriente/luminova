import { useState } from "react";
import { Command } from "cmdk";
import { Root, Trigger, Portal, Content } from "@radix-ui/react-popover";
import { cn } from "../lib/cn";
import { fieldControlClasses } from "./input";
import { Icon } from "./icons";

export type ComboboxOption = { value: string; label: string; disabled?: boolean };

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
}

/** Single-select + search on Radix Popover + cmdk, JCI-token styled. Re-select clears. */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  emptyText = "Sin resultados",
  disabled,
  id,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

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
            "flex items-center justify-between gap-2 text-left disabled:opacity-60",
            !selected && "text-ink-3",
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <span className="shrink-0 text-ink-2">{Icon.chevExpand({ s: 16 })}</span>
        </button>
      </Trigger>
      <Portal>
        {/* pointer-events-auto: stay clickable when portaled inside a modal Sheet
            (Dialog), whose pointer-events lock would otherwise disable the panel. */}
        <Content
          align="start"
          sideOffset={6}
          className="pointer-events-auto z-50 w-[var(--radix-popover-trigger-width)] rounded-card border border-line bg-surface p-1 shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)]"
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
              {options.map((o) => (
                <Command.Item
                  key={o.value}
                  value={o.label}
                  disabled={o.disabled}
                  onSelect={() => {
                    onChange(o.value === value ? null : o.value);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-base text-ink-1 data-[selected=true]:bg-surface-2 data-[disabled=true]:opacity-50"
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && (
                    <span className="text-jci-blue">{Icon.check({ s: 16 })}</span>
                  )}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Content>
      </Portal>
    </Root>
  );
}
