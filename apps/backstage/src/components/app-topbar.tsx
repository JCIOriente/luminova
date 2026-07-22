import { useLocation } from "@tanstack/react-router";
import { Icon, IconButton } from "@luminova/ui";
import { sectionTitle } from "./breadcrumb";
import { openCommandMenu } from "./command-menu-store";
import { NotificationBell } from "../features/notifications/components/notification-bell";

export function AppTopbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { pathname } = useLocation();
  const current = sectionTitle(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-[18px] border-b border-line bg-surface/80 px-4 backdrop-blur-[10px] backdrop-saturate-150 sm:px-7">
      <IconButton
        as="button"
        variant="subtle"
        size="md"
        aria-label="Abrir menú"
        className="lg:hidden"
        onClick={onOpenNav}
      >
        {Icon.menu({ s: 22 })}
      </IconButton>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-ui-sm font-medium text-ink-3">Backstage</span>
        <span className="text-ink-3">{Icon.chevRight({ s: 14 })}</span>
        <span className="min-w-0 truncate text-ui-lg font-semibold text-ink-1">{current}</span>
      </div>
      <div className="flex-1" />
      <IconButton
        as="button"
        variant="subtle"
        size="md"
        aria-label="Abrir buscador (⌘K)"
        className="lg:hidden"
        onClick={openCommandMenu}
      >
        {Icon.search({ s: 20 })}
      </IconButton>
      <button
        type="button"
        onClick={openCommandMenu}
        aria-label="Abrir buscador (⌘K)"
        className="hidden h-[38px] w-[268px] items-center gap-2.5 rounded-[10px] border border-line bg-surface-2 px-3 text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2 lg:flex"
      >
        {Icon.search({ s: 17 })}
        <span className="flex-1 text-left text-ui-sm">Buscar en Backstage…</span>
        <kbd className="rounded-[6px] border border-line-strong px-1.5 py-0.5 font-mono text-ui-2xs text-ink-3">
          ⌘K
        </kbd>
      </button>
      <NotificationBell />
    </header>
  );
}
