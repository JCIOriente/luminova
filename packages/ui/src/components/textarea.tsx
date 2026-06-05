import type { ComponentPropsWithRef } from "react";
import { cn } from "../lib/cn";
import { fieldControlClasses } from "./input";

export function Textarea({ className, ...props }: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      className={cn(fieldControlClasses, "min-h-[140px] resize-y leading-normal", className)}
      {...props}
    />
  );
}
