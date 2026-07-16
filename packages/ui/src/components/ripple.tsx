import type { CSSProperties, ReactElement } from "react";
import { cn } from "../lib/cn";

interface RippleSVGProps {
  rings?: number;
  baseRadius?: number;
  stroke?: number;
  size?: number;
  color?: string;
  /** Per-ring palette (cycled `colors[i % colors.length]`); overrides `color`. */
  colors?: string[];
  className?: string;
  style?: CSSProperties;
  rotateStep?: number;
  gapDeg?: number;
}

/** Concentric quarter-arc rings — the JCI Oriente brand motif. */
export function RippleSVG({
  rings = 7,
  baseRadius = 24,
  stroke = 6,
  size = 800,
  color = "var(--color-jci-blue)",
  colors,
  className = "",
  style = {},
  rotateStep = 15,
  gapDeg = 22,
}: RippleSVGProps) {
  const cx = size / 2;
  const cy = size / 2;
  const items: ReactElement[] = [];
  const palette = colors && colors.length > 0 ? colors : null;

  for (let i = 0; i < rings; i++) {
    const r = baseRadius + i * (stroke * 2);
    const baseRotate = i * rotateStep;
    const span = 90 - gapDeg;
    // stroke via style, not the attribute: var(--*) colors are invalid in
    // SVG presentation attributes but valid in CSS.
    const strokeStyle: CSSProperties = { stroke: palette ? palette[i % palette.length] : color };
    for (let q = 0; q < 4; q++) {
      const startAng = q * 90 + gapDeg / 2;
      const endAng = startAng + span;
      const startRad = ((startAng - 90) * Math.PI) / 180;
      const endRad = ((endAng - 90) * Math.PI) / 180;
      const x1 = cx + r * Math.cos(startRad);
      const y1 = cy + r * Math.sin(startRad);
      const x2 = cx + r * Math.cos(endRad);
      const y2 = cy + r * Math.sin(endRad);
      const largeArc = span > 180 ? 1 : 0;
      const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
      items.push(
        <path
          key={`${i}-${q}`}
          d={d}
          fill="none"
          style={strokeStyle}
          strokeWidth={stroke}
          strokeLinecap="butt"
          transform={`rotate(${baseRotate} ${cx} ${cy})`}
        />,
      );
    }
  }

  return (
    <svg
      className={className}
      style={style}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      {items}
    </svg>
  );
}

type RippleVariant =
  | "hero"
  | "hero-corner-tl"
  | "hero-center"
  | "split-art"
  | "footer"
  | "cta"
  | "subtle";

interface RippleBackgroundProps {
  variant?: RippleVariant;
  color?: string;
  /** Per-ring palette (cycled); overrides `color`. */
  colors?: string[];
  opacity?: number;
  spin?: boolean;
}

export function RippleBackground({
  variant = "subtle",
  color = "var(--color-jci-blue)",
  colors,
  opacity,
  spin = true,
}: RippleBackgroundProps) {
  let style: CSSProperties;
  let rings: number;
  let stroke: number;
  switch (variant) {
    case "hero":
      style = { right: "-12%", bottom: "-18%", width: "1100px", height: "1100px" };
      rings = 9;
      stroke = 9;
      break;
    case "hero-corner-tl":
      style = { left: "-18%", top: "-22%", width: "900px", height: "900px" };
      rings = 8;
      stroke = 8;
      break;
    case "hero-center":
      style = {
        left: "50%",
        top: "50%",
        width: "1300px",
        height: "1300px",
        transform: "translate(-50%, -50%)",
      };
      rings = 11;
      stroke = 9;
      break;
    case "split-art":
      style = {
        right: "8%",
        top: "50%",
        width: "520px",
        height: "520px",
        transform: "translateY(-50%)",
      };
      rings = 7;
      stroke = 8;
      break;
    case "footer":
      style = { right: "-10%", bottom: "-30%", width: "720px", height: "720px" };
      rings = 7;
      stroke = 7;
      break;
    case "cta":
      style = {
        left: "50%",
        bottom: "-40%",
        width: "900px",
        height: "900px",
        transform: "translateX(-50%)",
      };
      rings = 8;
      stroke = 8;
      break;
    default:
      style = { right: "-20%", top: "-30%", width: "520px", height: "520px" };
      rings = 6;
      stroke = 6;
  }
  return (
    <div
      className={cn(
        "absolute origin-center",
        spin && "animate-ripple-spin motion-reduce:animate-none",
      )}
      style={{ ...style, opacity: opacity ?? 0.085 }}
    >
      <RippleSVG rings={rings} stroke={stroke} color={color} colors={colors} size={800} />
    </div>
  );
}

export function RippleDivider({ color = "var(--color-line-strong)" }: { color?: string }) {
  return (
    <div className="flex justify-center py-2" aria-hidden="true">
      <div style={{ width: 56, height: 56, opacity: 0.55 }}>
        <RippleSVG rings={3} stroke={3} color={color} size={56} />
      </div>
    </div>
  );
}
