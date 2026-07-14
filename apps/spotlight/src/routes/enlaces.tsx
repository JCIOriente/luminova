import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/enlaces")({
  beforeLoad: () => {
    throw redirect({ to: "/linktree" });
  },
});
