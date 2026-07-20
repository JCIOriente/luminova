import { createFileRoute, redirect } from "@tanstack/react-router";
import { isMemberOnly } from "../lib/authz/is-member-only";
import { DashboardPage } from "../components/overview/dashboard-page";

export const Route = createFileRoute("/_app/")({
  beforeLoad: async ({ context }) => {
    await context.auth.ready;
    if (isMemberOnly(context.auth.getState().claims)) throw redirect({ to: "/me" });
  },
  component: DashboardPage,
});
