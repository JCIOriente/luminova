import { forwardRef, type ComponentPropsWithoutRef, type Ref, type ReactNode } from "react";
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
}

// Extend the native element props (minus our styling props) so a Radix `asChild`
// trigger's injected onPointerDown/onKeyDown/ref/aria-expanded pass through — this
// component is documented as a menu/overlay trigger. See button.tsx for the same fix.
type AnchorIconButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"a">, keyof CommonProps> & { as?: "a" };
type NativeIconButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps> & { as: "button" };

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
export const IconButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, IconButtonProps>(
  function IconButton(props, ref) {
    const { children, variant = "subtle", size = "sm", className, as, ...rest } = props;
    const cls = cn(BASE, SIZE[size], VARIANT[variant], className);

    // See button.tsx: `as` is destructured out (erasing the discriminant) so `rest`
    // and the forwardRef `Ref<Button | Anchor>` need per-branch assertions; the
    // runtime `as` check makes them sound.
    if (as === "button") {
      const buttonProps = rest as ComponentPropsWithoutRef<"button">;
      return (
        <button
          ref={ref as Ref<HTMLButtonElement>}
          {...buttonProps}
          type={buttonProps.type ?? "button"}
          className={cls}
        >
          {children}
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
        {children}
      </a>
    );
  },
);
