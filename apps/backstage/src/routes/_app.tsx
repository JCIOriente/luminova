import { useEffect, useState, useSyncExternalStore } from "react";
import { createFileRoute, redirect, Outlet, useLocation } from "@tanstack/react-router";
import { authRedirect } from "../lib/auth/guard";
import { AppSidebar } from "../components/app-sidebar";
import { AppTopbar } from "../components/app-topbar";
import { CommandMenu } from "../components/command-menu";
import { getSidebarCollapsed, subscribe } from "../lib/ui-prefs";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    await context.auth.ready;
    const { user } = context.auth.getState();
    const target = authRedirect(user, location.href);
    if (target) throw redirect(target);
  },
  component: AppLayout,
});

function AppLayout() {
  const collapsed = useSyncExternalStore(subscribe, getSidebarCollapsed, getSidebarCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <div
      className={`grid h-dvh grid-cols-1 grid-rows-[minmax(0,1fr)] bg-surface-2 ${collapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[264px_1fr]"}`}
    >
      <div className="hidden lg:block">
        <AppSidebar />
      </div>
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-jci-black/40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        inert={!drawerOpen}
        className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-expo motion-reduce:transition-none lg:hidden ${drawerOpen ? "translate-x-0 shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)]" : "-translate-x-full"}`}
      >
        <AppSidebar drawer onClose={() => setDrawerOpen(false)} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">
        <AppTopbar onOpenNav={() => setDrawerOpen(true)} />
        <main className="scroll flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1320px] px-4 pt-5 pb-20 sm:px-7 sm:pt-[30px]">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandMenu />
    </div>
  );
}
