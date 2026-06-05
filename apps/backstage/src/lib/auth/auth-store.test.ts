import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Auth, User } from "firebase/auth";

const onAuthStateChanged = vi.fn();
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (auth: Auth, cb: (u: User | null) => void) => onAuthStateChanged(auth, cb),
}));

import { createAuthStore } from "./auth-store";

function lastCallback(): (u: User | null) => void {
  return onAuthStateChanged.mock.calls.at(-1)![1];
}

describe("createAuthStore", () => {
  beforeEach(() => onAuthStateChanged.mockClear());

  it("starts in pending with no user", () => {
    const store = createAuthStore({} as Auth);
    expect(store.getState()).toEqual({ status: "pending", user: null });
  });

  it("becomes authenticated when a user is emitted", () => {
    const store = createAuthStore({} as Auth);
    const user = { uid: "u1" } as User;
    lastCallback()(user);
    expect(store.getState()).toEqual({ status: "authenticated", user });
  });

  it("becomes unauthenticated when null is emitted", () => {
    const store = createAuthStore({} as Auth);
    lastCallback()(null);
    expect(store.getState()).toEqual({ status: "unauthenticated", user: null });
  });

  it("resolves ready on first emission", async () => {
    const store = createAuthStore({} as Auth);
    lastCallback()(null);
    await expect(store.ready).resolves.toBeUndefined();
  });

  it("notifies subscribers on change", () => {
    const store = createAuthStore({} as Auth);
    const listener = vi.fn();
    store.subscribe(listener);
    lastCallback()({ uid: "u1" } as User);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
