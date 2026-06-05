import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ context }) => {
    await context.auth.ready;
    if (context.auth.getState().user) {
      throw redirect({ to: "/" });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-2 p-6">
      <div className="w-full max-w-[380px] rounded-card border border-line bg-surface p-8 shadow-[0_24px_48px_-24px_rgba(19,15,45,0.18)]">
        <h1 className="mb-6 text-[22px] font-semibold text-ink-1">Backstage</h1>
        <Outlet />
      </div>
    </div>
  );
}
