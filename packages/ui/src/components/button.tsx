import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface CommonProps {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  onDark?: boolean;
  onBlue?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  className?: string;
  children: ReactNode;
  onClick?: MouseEventHandler;
}

interface AnchorButton extends CommonProps {
  as?: "a";
  href?: string;
  target?: string;
  rel?: string;
  "aria-label"?: string;
}

interface NativeButton extends CommonProps {
  as: "button";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

export type ButtonProps = AnchorButton | NativeButton;

const BASE =
  "inline-flex items-center justify-center gap-2.5 h-13 px-6.5 rounded-pill border-[1.5px] border-transparent font-semibold text-[15px] -tracking-[0.005em] whitespace-nowrap cursor-pointer transition-[transform,background-color,color,box-shadow,border-color] duration-200 ease-expo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue [&_.arrow]:transition-transform [&_.arrow]:duration-200 hover:[&_.arrow]:translate-x-[3px]";

function variantClasses(variant: ButtonVariant, onDark: boolean, onBlue: boolean): string {
  switch (variant) {
    case "secondary":
      return cn(
        "bg-transparent text-ink-1 border-line-strong hover:border-ink-1 hover:-translate-y-0.5",
        onDark && "text-jci-white border-white/30 hover:border-white",
        onBlue && "text-jci-white border-white/45 hover:border-white hover:bg-white/[0.07]",
      );
    case "ghost":
      return cn(
        "bg-transparent h-auto py-1 px-0.5 border-0 text-jci-blue hover:text-jci-blue-2",
        onDark && "text-jci-teal",
        onBlue && "text-jci-white",
      );
    default:
      return cn(
        "bg-jci-blue text-jci-white hover:bg-jci-blue-2 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-12px_rgba(0,151,215,0.55)] active:translate-y-0",
        onDark && "shadow-[0_8px_24px_-8px_rgba(0,151,215,0.55)]",
        onBlue &&
          "bg-jci-white text-jci-black hover:bg-white/90 hover:shadow-[0_14px_34px_-12px_rgba(0,0,0,0.35)]",
      );
  }
}

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    onDark = false,
    onBlue = false,
    iconLeft,
    iconRight,
    className,
    children,
  } = props;

  const cls = cn(
    BASE,
    variantClasses(variant, onDark, onBlue),
    size === "sm" && "h-[42px] px-[18px] text-sm",
    className,
  );

  const inner = (
    <>
      {iconLeft}
      <span>{children}</span>
      {iconRight}
    </>
  );

  if (props.as === "button") {
    return (
      <button
        className={cn(
          cls,
          props.disabled &&
            "cursor-not-allowed opacity-[0.55] hover:translate-y-0 hover:shadow-none",
        )}
        type={props.type ?? "button"}
        onClick={props.onClick}
        disabled={props.disabled}
      >
        {inner}
      </button>
    );
  }

  return (
    <a
      className={cls}
      href={props.href ?? "#"}
      target={props.target}
      rel={props.rel}
      aria-label={props["aria-label"]}
      onClick={props.onClick}
    >
      {inner}
    </a>
  );
}
