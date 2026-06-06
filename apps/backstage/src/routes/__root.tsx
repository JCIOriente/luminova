import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import type { RouterContext } from "../lib/router-context";
import { queryClient } from "../lib/query-client";
import { useAuth } from "../lib/auth/auth";
import { AbilityProvider } from "../lib/authz/ability-context";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const { user, claims } = useAuth();
  return (
    <QueryClientProvider client={queryClient}>
      <AbilityProvider claims={claims} uid={user?.uid ?? ""}>
        <Outlet />
      </AbilityProvider>
    </QueryClientProvider>
  );
}
