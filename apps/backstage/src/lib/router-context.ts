import type { QueryClient } from "@tanstack/react-query";
import type { AuthStore } from "./auth/auth-store";

export interface RouterContext {
  queryClient: QueryClient;
  auth: AuthStore;
}
