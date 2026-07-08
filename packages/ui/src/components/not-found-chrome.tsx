import { cn } from "../lib/cn";
import { RippleBackground } from "./ripple";

// Shared visual chrome for the 404 stage, deduped from both apps' not-found pages.
// Each app keeps its own stage container, copy, and CTAs (they legitimately diverge);
// only the brand chrome — the ambient wash, pulse blob, ripple, and the gradient
// numeral — lives here. rgba(87,188,188,.85) is jci-teal at 85%: a var() can't be
// used inside a background-clip gradient stop, so the literal is centralized here
// rather than duplicated across two apps.
export const NUMERAL_GRADIENT = "linear-gradient(180deg, #ffffff 0%, rgba(87,188,188,0.85) 100%)";

const AMBIENT_WASH =
  "radial-gradient(120% 90% at 50% 11%, rgba(0,151,215,0.20), transparent 55%), radial-gradient(70% 60% at 50% 81%, rgba(239,196,15,0.10), transparent 60%)";
const PULSE_BLOB = "radial-gradient(circle, rgba(239,196,15,0.17), transparent 62%)";

/**
 * Decorative dark-stage layers for the 404 page. Render as the first child of a
 * `position: relative` stage and place the page content after it, so the content
 * stacks on top by DOM order (no z-index coupling to the host app's context).
 */
export function NotFoundBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: AMBIENT_WASH }} />
      <div
        className="absolute top-[42%] left-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[6px] motion-safe:animate-pulse"
        style={{ background: PULSE_BLOB }}
      />
      <RippleBackground variant="hero-center" color="var(--color-jci-teal)" opacity={0.13} />
    </div>
  );
}

/**
 * The giant gradient-filled "404" numeral with its glow. `fontSize` differs per
 * app (marketing vs admin density) so it's a prop; the gradient fill + glow are
 * shared brand chrome.
 */
export function Numeral404({ fontSize, className }: { fontSize: string; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("font-serif leading-[0.9] tracking-[-0.04em] select-none", className)}
      style={{
        fontSize,
        background: NUMERAL_GRADIENT,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        textShadow: "0 0 60px rgba(0,151,215,0.25)",
      }}
    >
      404
    </div>
  );
}
