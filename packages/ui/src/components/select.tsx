import type { ComponentPropsWithRef, CSSProperties } from "react";
import { cn } from "../lib/cn";
import { fieldControlClasses } from "./input";

const CHEVRON =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'><path d='M1 1.5L6 6.5L11 1.5' stroke='%23130F2D' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>\")";

const CHEVRON_STYLE: CSSProperties = {
  backgroundImage: CHEVRON,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 16px center",
  backgroundSize: "12px 8px",
};

export function Select({ className, style, ...props }: ComponentPropsWithRef<"select">) {
  return (
    <select
      className={cn(fieldControlClasses, "appearance-none pr-11", className)}
      style={{ ...CHEVRON_STYLE, ...style }}
      {...props}
    />
  );
}
