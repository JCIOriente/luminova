import { useLocation } from "@tanstack/react-router";
import { Icon } from "@luminova/ui";
import { sectionTitle } from "./breadcrumb";

export function AppTopbar() {
  const { pathname } = useLocation();
  const current = sectionTitle(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-[18px] border-b border-line bg-surface/80 px-7 backdrop-blur-[10px] backdrop-saturate-150">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-[13.5px] font-medium text-ink-3">Backstage</span>
        <span className="text-ink-3">{Icon.chevRight({ s: 14 })}</span>
        <span className="text-[14.5px] font-semibold text-ink-1">{current}</span>
      </div>
      <div className="flex-1" />
      <div
        className="flex h-[38px] w-[268px] items-center gap-2.5 rounded-[10px] border border-line bg-surface-2 px-3 text-ink-3"
        aria-hidden="true"
      >
        {Icon.search({ s: 17 })}
        <span className="flex-1 text-[13.5px]">Buscar en Backstage…</span>
        <kbd className="rounded-[6px] border border-line-strong px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3">
          ⌘K
        </kbd>
      </div>
      <button
        type="button"
        className="flex size-[38px] items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-ink-1/[0.04] hover:text-ink-1"
        aria-label="Notificaciones"
      >
        {Icon.bell({ s: 20 })}
      </button>
    </header>
  );
}
