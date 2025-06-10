import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AuthService } from "../services/authService";
import type { AuthUser } from "../types/auth";

const AUTH_QUERY_KEY = ["auth"] as const;

export const useAuth = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = AuthService.observeAuthState((user) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
    });

    return () => unsubscribe();
  }, [queryClient]);

  return useQuery<AuthUser | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => null, // Initial value, will be updated by the observer
    staleTime: Infinity,
  });
};
