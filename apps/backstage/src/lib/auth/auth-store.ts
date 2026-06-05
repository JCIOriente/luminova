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

export function createAuthStore(auth: Auth): AuthStore {
  let state: AuthState = { status: "pending", user: null };
  const listeners = new Set<() => void>();
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  onAuthStateChanged(auth, (user) => {
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
