import type { ComponentPropsWithRef } from "react";
import { cn } from "../lib/cn";

export const fieldControlClasses =
  "w-full h-[52px] bg-surface border-[1.5px] border-line-strong rounded-[10px] px-4 font-sans text-base text-ink-1 placeholder:text-ink-3 transition-[border-color,box-shadow] duration-200 ease-expo hover:border-[rgba(19,15,45,0.26)] focus:outline-none focus:border-jci-blue focus:shadow-[0_0_0_4px_rgba(0,151,215,0.16)] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3 aria-[invalid=true]:border-error aria-[invalid=true]:focus:shadow-[0_0_0_4px_rgba(192,57,43,0.14)]";

export function Input({ className, ...props }: ComponentPropsWithRef<"input">) {
  return <input className={cn(fieldControlClasses, className)} {...props} />;
}
