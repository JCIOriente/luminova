import { LogoLockup, RippleBackground } from "@luminova/ui";

const META = ["JCI Oriente", "Santa Cruz · Bolivia", "Desde 1993"];

export function BrandSide() {
  return (
    <aside className="relative isolate hidden flex-col items-start justify-between overflow-hidden bg-jci-black p-12 text-on-dark-1 lg:flex">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 18% 8%, rgba(0,151,215,0.16), transparent 56%), radial-gradient(90% 80% at 92% 100%, rgba(87,188,188,0.12), transparent 52%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <RippleBackground variant="hero-center" color="#ffffff" opacity={0.1} />
      </div>

      <LogoLockup variant="inverted" size="sm" />

      <div className="max-w-[480px]">
        <div className="mb-6 inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-jci-blue-75 before:h-px before:w-6 before:bg-current before:opacity-70">
          Portal de la directiva
        </div>
        <h2 className="text-[clamp(40px,4.6vw,60px)] font-light leading-[1.02] -tracking-[0.03em]">
          Sé el <b className="font-semibold">cambio.</b>
        </h2>
        <p className="mt-4 font-serif text-[17px] italic text-on-dark-3">Become the change.</p>
        <p className="mt-6 max-w-[420px] text-[16.5px] leading-[1.62] text-on-dark-2">
          El panel interno de JCI Oriente. Coordina miembros, eventos y proyectos del capítulo desde
          un solo lugar.
        </p>
      </div>

      <div className="flex w-full items-center gap-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-on-dark-3">
        {META.map((label, i) => (
          <span key={label} className="inline-flex items-center gap-4">
            {i > 0 && <span className="h-1 w-1 shrink-0 rounded-full bg-jci-blue" />}
            {label}
          </span>
        ))}
      </div>
    </aside>
  );
}
