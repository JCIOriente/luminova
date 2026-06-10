import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "./lib/query-client";
import { authStore } from "./lib/auth/auth";
import { PendingScreen } from "./components/pending-screen";
import { NotFound } from "./components/not-found";

export const router = createRouter({
  routeTree,
  context: { queryClient, auth: authStore },
  defaultPreload: "intent",
  defaultPendingComponent: PendingScreen,
  defaultNotFoundComponent: NotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
