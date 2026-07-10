import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/programas/")({
  beforeLoad: () => {
    throw redirect({ to: "/impacto" });
  },
});
