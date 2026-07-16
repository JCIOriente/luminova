import type { ReactNode } from "react";
import { LogoLockup, RippleBackground, cn } from "@luminova/ui";

interface BrandSideProps {
  tone?: "dark" | "blue";
  eyebrow?: string;
  title?: ReactNode;
  lead?: string;
}

const META = ["JCI Oriente", "Santa Cruz · Bolivia", "Desde 1993"];

// The four brand hues, blue-weighted (per the JCI palette ratio) and cycled
// per ring to build the multi-color ripple from the brand guidelines.
const BRAND_RIPPLE = [
  "var(--color-jci-blue)",
  "var(--color-jci-teal)",
  "var(--color-jci-navy)",
  "var(--color-jci-blue)",
  "var(--color-jci-yellow)",
];

export function BrandSide({
  tone = "dark",
  eyebrow = "Portal de la directiva",
  title = (
    <>
      Inspira<b className="font-semibold">.</b>
    </>
  ),
  lead = "El panel interno de JCI Oriente. Coordina miembros, eventos y proyectos del capítulo desde un solo lugar.",
}: BrandSideProps) {
  const blue = tone === "blue";
  return (
    <aside
      className={cn(
        "relative isolate hidden flex-col items-start justify-between overflow-hidden p-12 text-on-dark-1 lg:flex",
        blue ? "bg-jci-blue" : "bg-jci-black",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: blue
            ? "radial-gradient(120% 90% at 18% 8%, rgba(255,255,255,0.18), transparent 56%), radial-gradient(90% 80% at 92% 100%, rgba(87,188,188,0.22), transparent 52%)"
            : "radial-gradient(120% 90% at 18% 8%, rgba(0,151,215,0.16), transparent 56%), radial-gradient(90% 80% at 92% 100%, rgba(87,188,188,0.12), transparent 52%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <RippleBackground
          variant="hero-center"
          colors={BRAND_RIPPLE}
          opacity={blue ? 0.32 : 0.42}
        />
      </div>

      <LogoLockup variant={blue ? "on-blue" : "inverted"} size="lg" />

      <div className="max-w-[480px] animate-rise motion-reduce:animate-none">
        <div
          className={cn(
            "mb-6 inline-flex items-center gap-2.5 font-mono text-ui-2xs uppercase tracking-[0.22em] before:h-px before:w-6 before:bg-current before:opacity-70",
            blue ? "text-white/85" : "text-jci-blue-75",
          )}
        >
          {eyebrow}
        </div>
        <h2 className="text-[clamp(40px,4.6vw,60px)] font-light leading-[1.02] -tracking-[0.03em]">
          {title}
        </h2>
        <p className="mt-4 font-serif text-ui-lg italic text-on-dark-2">
          A fire shared never dies.
        </p>
        <p className="mt-6 max-w-[420px] text-ui-lg leading-[1.62] text-on-dark-2">{lead}</p>
      </div>

      <div className="flex w-full items-center gap-4 font-mono text-ui-2xs uppercase tracking-[0.16em] text-on-dark-3">
        {META.map((label, i) => (
          <span key={label} className="inline-flex items-center gap-4">
            {i > 0 && (
              <span
                className={cn("h-1 w-1 shrink-0 rounded-full", blue ? "bg-white" : "bg-jci-blue")}
              />
            )}
            {label}
          </span>
        ))}
      </div>
    </aside>
  );
}
