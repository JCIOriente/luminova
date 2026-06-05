import type { CSSProperties } from "react";
import clsx from "clsx";

interface ImgSlotProps {
  label: string;
  tint?: "blue" | "teal" | "navy";
  dark?: boolean;
  aspect?: string;
  height?: number | string;
  style?: CSSProperties;
}

export function ImgSlot({
  label,
  tint,
  dark = false,
  aspect = "4/3",
  height,
  style = {},
}: ImgSlotProps) {
  const cls = clsx("img-slot", dark && "dark", tint && `tinted-${tint}`);
  const s: CSSProperties = {
    aspectRatio: height ? undefined : aspect,
    height,
    ...style,
  };
  return (
    <div className={cls} style={s} aria-label={label} role="img">
      <div className="img-label">{label}</div>
    </div>
  );
}
