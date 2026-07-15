import { useEffect, useState, useSyncExternalStore } from "react";
import { createFileRoute, redirect, Outlet, useLocation } from "@tanstack/react-router";
import { Drawer } from "@luminova/ui";
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

  return (
    <div
      className={`grid h-dvh grid-cols-1 grid-rows-[minmax(0,1fr)] bg-surface-2 ${collapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[264px_1fr]"}`}
    >
      <div className="hidden lg:block">
        <AppSidebar />
      </div>
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        side="left"
        title="Menú de navegación"
        className="w-[264px]"
      >
        <AppSidebar drawer onClose={() => setDrawerOpen(false)} />
      </Drawer>
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
