import { forwardRef, type ComponentPropsWithoutRef, type Ref, type ReactNode } from "react";
import { cn } from "../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "link";
type ButtonTone = "brand" | "neutral" | "danger";

interface CommonProps {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  onDark?: boolean;
  onBlue?: boolean;
  /** Color of the `link` variant only (inline text action). */
  tone?: ButtonTone;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
}

// Extend the native element props (minus our styling props) so every DOM / event /
// aria / data attribute — including the onPointerDown / onKeyDown / ref / aria-expanded
// a Radix `asChild` trigger injects — passes straight through. Without this, a Button
// used as a Menu/Popover trigger was a dead control: Radix opens on pointerdown, which
// the old whitelist-only Button dropped.
type AnchorButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"a">, keyof CommonProps> & { as?: "a" };
type NativeButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps> & { as: "button" };

export type ButtonProps = AnchorButton | NativeButton;

const BASE =
  "inline-flex items-center justify-center gap-2.5 h-13 px-6.5 rounded-pill border-[1.5px] border-transparent font-semibold text-[15px] -tracking-[0.005em] whitespace-nowrap cursor-pointer transition-[transform,background-color,color,box-shadow,border-color] duration-200 ease-expo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue [&_.arrow]:transition-transform [&_.arrow]:duration-200 hover:[&_.arrow]:translate-x-[3px]";

function variantClasses(
  variant: ButtonVariant,
  onDark: boolean,
  onBlue: boolean,
  tone: ButtonTone,
): string {
  switch (variant) {
    case "link":
      return cn(
        "h-auto rounded-none border-0 bg-transparent p-0 text-[13px] font-semibold",
        tone === "neutral" && "text-ink-2 hover:text-ink-1",
        tone === "danger" && "text-ink-3 hover:text-error",
        tone === "brand" && "text-jci-blue hover:text-jci-blue-2",
      );
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

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button(props, ref) {
    const {
      variant = "primary",
      size = "md",
      onDark = false,
      onBlue = false,
      tone = "brand",
      iconLeft,
      iconRight,
      className,
      children,
      as,
      ...rest
    } = props;

    const cls = cn(
      BASE,
      variantClasses(variant, onDark, onBlue, tone),
      size === "sm" && variant !== "link" && "h-[42px] px-[18px] text-sm",
      className,
    );

    const inner = (
      <>
        {iconLeft}
        <span>{children}</span>
        {iconRight}
      </>
    );

    if (as === "button") {
      // Narrow the union rest to native <button> attrs so the injected trigger
      // props (onPointerDown/onKeyDown/aria-expanded/data-state) spread through.
      const buttonProps = rest as ComponentPropsWithoutRef<"button">;
      return (
        <button
          ref={ref as Ref<HTMLButtonElement>}
          {...buttonProps}
          type={buttonProps.type ?? "button"}
          className={cn(
            cls,
            buttonProps.disabled &&
              "cursor-not-allowed opacity-[0.55] hover:translate-y-0 hover:shadow-none",
          )}
        >
          {inner}
        </button>
      );
    }

    const anchorProps = rest as ComponentPropsWithoutRef<"a">;
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        {...anchorProps}
        href={anchorProps.href ?? "#"}
        className={cls}
      >
        {inner}
      </a>
    );
  },
);
