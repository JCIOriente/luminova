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

function fakeUser(uid: string, claims: Record<string, unknown> = {}): User {
  return {
    uid,
    getIdTokenResult: () => Promise.resolve({ claims } as never),
  } as unknown as User;
}

describe("createAuthStore", () => {
  beforeEach(() => onAuthStateChanged.mockClear());

  it("starts in pending with no user", () => {
    const store = createAuthStore({} as Auth);
    expect(store.getState()).toEqual({ status: "pending", user: null, claims: { roles: [] } });
  });

  it("becomes authenticated when a user is emitted", () => {
    const store = createAuthStore({} as Auth);
    const user = fakeUser("u1");
    lastCallback()(user);
    expect(store.getState()).toEqual({ status: "authenticated", user, claims: { roles: [] } });
  });

  it("decodes roles from the id token after emission", async () => {
    const store = createAuthStore({} as Auth);
    const user = fakeUser("u1", { roles: ["Treasury"] });
    lastCallback()(user);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().claims).toEqual({ roles: ["Treasury"] });
  });

  it("holds ready until claims decode for an authenticated user", async () => {
    const store = createAuthStore({} as Auth);
    store.subscribe(() => {});
    lastCallback()(fakeUser("u1", { roles: ["Admin"] }));
    // beforeLoad awaits ready THEN reads claims synchronously — so by the time
    // ready resolves, claims must already be decoded, not the empty placeholder.
    await store.ready;
    expect(store.getState().claims).toEqual({ roles: ["Admin"] });
  });

  it("becomes unauthenticated when null is emitted", () => {
    const store = createAuthStore({} as Auth);
    lastCallback()(null);
    expect(store.getState()).toEqual({
      status: "unauthenticated",
      user: null,
      claims: { roles: [] },
    });
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
    lastCallback()(fakeUser("u1"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("resolves ready via timeout when Firebase never emits", async () => {
    vi.useFakeTimers();
    try {
      const store = createAuthStore({} as Auth, 5000);
      let resolved = false;
      void store.ready.then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(resolved).toBe(true);
      expect(store.getState().status).toBe("pending");
    } finally {
      vi.useRealTimers();
    }
  });
});
