import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { authRedirect } from "../lib/auth/guard";
import { AppSidebar } from "../components/app-sidebar";

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
    <div className="flex min-h-dvh">
      <AppSidebar />
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
