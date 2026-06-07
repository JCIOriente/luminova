import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { authRedirect } from "../lib/auth/guard";
import { AppSidebar } from "../components/app-sidebar";
import { AppTopbar } from "../components/app-topbar";
import { CommandMenu } from "../components/command-menu";

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
  return (
    <div className="grid h-dvh grid-cols-[264px_1fr] bg-surface-2">
      <AppSidebar />
      <div className="flex min-w-0 flex-col">
        <AppTopbar />
        <main className="scroll flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1320px] px-7 pt-[30px] pb-20">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandMenu />
    </div>
  );
}
