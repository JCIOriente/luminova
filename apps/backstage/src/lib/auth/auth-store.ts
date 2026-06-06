import { onAuthStateChanged, type Auth, type User } from "firebase/auth";
import type { AuthClaims } from "@luminova/auth/roles";
import { decodeClaims } from "../authz/claims";

type AuthStatus = "pending" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  claims: AuthClaims;
}

export interface AuthStore {
  ready: Promise<void>;
  getState: () => AuthState;
  subscribe: (listener: () => void) => () => void;
}

const READY_TIMEOUT_MS = 8000;
const EMPTY_CLAIMS: AuthClaims = { roles: [] };

export function createAuthStore(auth: Auth, readyTimeoutMs: number = READY_TIMEOUT_MS): AuthStore {
  let state: AuthState = { status: "pending", user: null, claims: EMPTY_CLAIMS };
  const listeners = new Set<() => void>();
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  // Fall back to a resolved `ready` if Firebase never emits (e.g. unreachable),
  // so route guards redirect to /login instead of hanging on PendingScreen.
  const timer = setTimeout(() => resolveReady(), readyTimeoutMs);
  (timer as { unref?: () => void }).unref?.();

  function emit(next: AuthState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  onAuthStateChanged(auth, (user) => {
    clearTimeout(timer);
    if (!user) {
      emit({ status: "unauthenticated", user: null, claims: EMPTY_CLAIMS });
      resolveReady();
      return;
    }
    emit({ status: "authenticated", user, claims: EMPTY_CLAIMS });
    resolveReady();
    void user
      .getIdTokenResult()
      .then((result) => {
        if (state.user === user) {
          emit({ status: "authenticated", user, claims: decodeClaims(result.claims) });
        }
      })
      .catch(() => {
        /* keep empty claims on token failure */
      });
  });

  return {
    ready,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
