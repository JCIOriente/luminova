import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ context }) => {
    await context.auth.ready;
    if (context.auth.getState().user) {
      throw redirect({ to: "/" });
    }
  },
  component: Outlet,
});
