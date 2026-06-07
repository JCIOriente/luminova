import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "../lib/cn";

type IconButtonVariant = "subtle" | "ghost" | "danger";
type IconButtonSize = "sm" | "md";

interface CommonProps {
  /** The icon node (e.g. `Icon.bell({ s: 20 })`). */
  children: ReactNode;
  /** Required — icon-only buttons must be labelled for assistive tech. */
  "aria-label": string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  className?: string;
  onClick?: MouseEventHandler;
}

interface AnchorIconButton extends CommonProps {
  as?: "a";
  href?: string;
  target?: string;
  rel?: string;
}

interface NativeIconButton extends CommonProps {
  as: "button";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

export type IconButtonProps = AnchorIconButton | NativeIconButton;

const BASE =
  "inline-flex shrink-0 cursor-pointer items-center justify-center transition-colors duration-200 ease-expo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue disabled:cursor-not-allowed disabled:opacity-[0.55]";

const SIZE: Record<IconButtonSize, string> = {
  sm: "size-8 rounded-[8px]",
  md: "size-10 rounded-[10px]",
};

const VARIANT: Record<IconButtonVariant, string> = {
  subtle: "text-ink-2 hover:bg-ink-1/[0.04] hover:text-ink-1",
  ghost: "text-ink-2 hover:text-ink-1",
  danger: "text-ink-3 hover:bg-error/10 hover:text-error",
};

/**
 * Square, icon-only button. Use for table row actions, toolbar/topbar controls,
 * and menu/overlay triggers — not for text CTAs (use `Button`). `aria-label` is
 * required; focus-visible and `type` are handled here.
 */
export function IconButton(props: IconButtonProps) {
  const { children, variant = "subtle", size = "sm", className, onClick } = props;
  const cls = cn(BASE, SIZE[size], VARIANT[variant], className);
  const label = props["aria-label"];

  if (props.as === "button") {
    return (
      <button
        className={cls}
        type={props.type ?? "button"}
        disabled={props.disabled}
        aria-label={label}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }

  return (
    <a
      className={cls}
      href={props.href ?? "#"}
      target={props.target}
      rel={props.rel}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
