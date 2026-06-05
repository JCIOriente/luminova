import { onAuthStateChanged, type Auth, type User } from "firebase/auth";

type AuthStatus = "pending" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  user: User | null;
}

export interface AuthStore {
  ready: Promise<void>;
  getState: () => AuthState;
  subscribe: (listener: () => void) => () => void;
}

const READY_TIMEOUT_MS = 8000;

export function createAuthStore(auth: Auth, readyTimeoutMs: number = READY_TIMEOUT_MS): AuthStore {
  let state: AuthState = { status: "pending", user: null };
  const listeners = new Set<() => void>();
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  // Fall back to a resolved `ready` if Firebase never emits (e.g. unreachable),
  // so route guards redirect to /login instead of hanging on PendingScreen.
  const timer = setTimeout(() => resolveReady(), readyTimeoutMs);
  (timer as { unref?: () => void }).unref?.();

  onAuthStateChanged(auth, (user) => {
    clearTimeout(timer);
    state = { status: user ? "authenticated" : "unauthenticated", user };
    resolveReady();
    listeners.forEach((listener) => listener());
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
