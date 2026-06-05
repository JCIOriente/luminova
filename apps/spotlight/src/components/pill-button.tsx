import type { MouseEventHandler, ReactNode } from "react";
import clsx from "clsx";

interface CommonProps {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  onDark?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  className?: string;
  children: ReactNode;
  onClick?: MouseEventHandler;
}

interface AnchorPill extends CommonProps {
  as?: "a";
  href?: string;
  target?: string;
  rel?: string;
  "aria-label"?: string;
}

interface ButtonPill extends CommonProps {
  as: "button";
  type?: "button" | "submit" | "reset";
}

type PillButtonProps = AnchorPill | ButtonPill;

export function PillButton(props: PillButtonProps) {
  const {
    variant = "primary",
    size = "md",
    onDark = false,
    iconLeft,
    iconRight,
    className,
    children,
  } = props;

  const cls = clsx(
    "btn",
    `btn-${variant}`,
    size === "sm" && "btn-sm",
    onDark && "on-dark",
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
      <button className={cls} type={props.type ?? "button"} onClick={props.onClick}>
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
