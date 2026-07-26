import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./icons";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/** Token-styled checkbox: a visually-hidden control + a branded box. */
export function Checkbox({ checked, onChange, label, id, disabled, className }: CheckboxProps) {
  return (
    <label
      // `relative` contains the `sr-only` (position:absolute) input below. Without a
      // positioned ancestor its containing block is the initial containing block — in
      // a nested-scroll layout (backstage `_app`: fixed `h-dvh` shell + inner
      // `overflow-y-auto`) that decouples the input's box from the scroll content, so
      // clicking the label focuses an input rendered far off-screen and the browser
      // scroll-into-views the page to blank space. Containing it keeps the input at
      // the label. (login is immune only because it doesn't scroll.)
      className={cn(
        "relative inline-flex select-none items-center gap-2.5 text-[13.5px] font-medium text-ink-2",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] border-line-strong bg-surface text-white transition-colors duration-150 ease-expo peer-checked:border-jci-blue peer-checked:bg-jci-blue peer-focus-visible:shadow-[0_0_0_4px_rgba(0,151,215,0.16)]">
        <span className={cn("transition-opacity", checked ? "opacity-100" : "opacity-0")}>
          {Icon.check({ s: 13 })}
        </span>
      </span>
      {label}
    </label>
  );
}
