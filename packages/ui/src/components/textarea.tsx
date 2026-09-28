import type { ComponentPropsWithRef } from "react";
import { cn } from "../lib/cn";
import { fieldControlClasses } from "./input";
import { useFieldControlAria } from "./field-context";

export function Textarea({ className, ...props }: ComponentPropsWithRef<"textarea">) {
  const aria = useFieldControlAria(props);
  return (
    <textarea
      className={cn(
        fieldControlClasses,
        "h-auto min-h-[132px] resize-y py-[13px] leading-normal",
        className,
      )}
      {...props}
      {...aria}
    />
  );
}
