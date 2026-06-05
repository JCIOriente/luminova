import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";
import { ArrowRight } from "./icons";

interface ArrowLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
  onDark?: boolean;
}

export function ArrowLink({ children, className, onDark = false, ...rest }: ArrowLinkProps) {
  return (
    <a
      className={cn(
        "inline-flex items-center gap-2 font-semibold [&_.arrow]:transition-transform [&_.arrow]:duration-200 hover:[&_.arrow]:translate-x-1",
        onDark ? "text-jci-teal" : "text-jci-blue",
        className,
      )}
      {...rest}
    >
      <span>{children}</span>
      <ArrowRight />
    </a>
  );
}
