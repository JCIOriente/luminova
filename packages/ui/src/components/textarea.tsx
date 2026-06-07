import type { ComponentPropsWithRef } from "react";
import { cn } from "../lib/cn";
import { fieldControlClasses } from "./input";

export function Textarea({ className, ...props }: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      className={cn(
        fieldControlClasses,
        "h-auto min-h-[132px] resize-y py-[13px] leading-normal",
        className,
      )}
      {...props}
    />
  );
}
