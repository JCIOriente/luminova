import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { BrandSide } from "../features/auth/components/brand-side";

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
    <div className="grid min-h-dvh grid-cols-1 bg-surface lg:grid-cols-[1.04fr_1fr]">
      <BrandSide />
      <div className="flex items-center justify-center overflow-y-auto bg-surface-2 px-6 py-12 sm:px-10">
        <Outlet />
      </div>
    </div>
  );
}
