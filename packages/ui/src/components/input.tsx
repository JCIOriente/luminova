import type { ComponentPropsWithRef } from "react";
import { cn } from "../lib/cn";

export const fieldControlClasses =
  "w-full bg-surface border border-line-strong rounded-[10px] px-4 py-3.5 font-sans text-base text-ink-1 transition-[border-color,box-shadow] duration-150 ease-out focus:outline-none focus:border-jci-blue focus:shadow-[0_0_0_4px_rgba(0,151,215,0.14)]";

export function Input({ className, ...props }: ComponentPropsWithRef<"input">) {
  return <input className={cn(fieldControlClasses, className)} {...props} />;
}
