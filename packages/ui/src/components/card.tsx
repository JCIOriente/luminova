import type { ComponentPropsWithRef } from "react";
import { cn } from "../lib/cn";

export const cardSurfaceClasses =
  "rounded-card border border-line bg-surface shadow-[0_1px_2px_rgba(19,15,45,0.05)]";

export const cardInteractiveClasses =
  "transition-[transform,box-shadow,border-color] duration-200 ease-expo hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_18px_40px_-24px_rgba(19,15,45,0.3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue motion-reduce:hover:translate-y-0";

type CardElement = "div" | "section" | "article" | "aside" | "header";

const PADDING = {
  md: "p-5",
  sm: "p-4",
  row: "px-4 py-3",
  none: "",
} as const;

interface CardProps extends ComponentPropsWithRef<"div"> {
  as?: CardElement;
  padding?: keyof typeof PADDING;
  interactive?: boolean;
}

/** The DS card shell: 12px radius, hairline border, resting shadow. Interactive
 *  hosts (button, router Link) compose cardSurfaceClasses/cardInteractiveClasses
 *  directly instead. */
export function Card({
  as: Tag = "div",
  padding = "md",
  interactive = false,
  className,
  ...props
}: CardProps) {
  return (
    <Tag
      className={cn(
        cardSurfaceClasses,
        PADDING[padding],
        interactive && cardInteractiveClasses,
        className,
      )}
      {...props}
    />
  );
}
