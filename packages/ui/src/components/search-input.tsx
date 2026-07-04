import { useId, type ComponentPropsWithRef } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./icons";
import { Input } from "./input";

const SIZE = {
  md: { input: "h-11 pl-11", icon: "left-3.5", iconSize: 18 },
  sm: { input: "h-10 pl-9", icon: "left-3", iconSize: 16 },
} as const;

interface SearchInputProps extends Omit<ComponentPropsWithRef<"input">, "size"> {
  label: string;
  size?: keyof typeof SIZE;
}

/** Leading-icon search field. `label` renders sr-only and is wired via
 *  htmlFor; `className` styles the wrapper — size the input via `size`. */
export function SearchInput({ label, size = "md", className, ...props }: SearchInputProps) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const s = SIZE[size];
  return (
    <div className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span
        className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-3", s.icon)}
      >
        {Icon.search({ s: s.iconSize })}
      </span>
      <Input
        {...props}
        id={id}
        type="search"
        // WebKit renders its own clear (x) control on type=search; suppress it
        // so the field looks identical across browsers.
        className={cn(s.input, "[&::-webkit-search-cancel-button]:appearance-none")}
      />
    </div>
  );
}
