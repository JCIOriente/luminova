import { useSyncExternalStore } from "react";
import { getFirebase } from "@luminova/firebase";
import { createAuthStore, type AuthState } from "./auth-store";

export const authStore = createAuthStore(getFirebase().auth);

export function useAuth(): AuthState {
  return useSyncExternalStore(authStore.subscribe, authStore.getState, authStore.getState);
}
