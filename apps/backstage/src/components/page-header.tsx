import type { ReactNode } from "react";

/** Admin page header: mono eyebrow + title + optional subtitle, with an
 *  optional right-aligned action slot. Shared by the Overview and list routes. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <div className="mb-2.5 font-mono text-[11px] tracking-[0.14em] text-jci-blue uppercase">
          {eyebrow}
        </div>
        <h1 className="text-[30px] font-normal leading-tight tracking-[-0.02em] text-ink-1">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-[14.5px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}
