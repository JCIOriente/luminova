import { describe, it, expect, vi } from "vitest";

const getFirebase = vi.fn();
vi.mock("@luminova/firebase", () => ({ getFirebase: () => getFirebase() }));

import { requireUid } from "./require-uid";

describe("requireUid", () => {
  it("returns the current user's uid", () => {
    getFirebase.mockReturnValue({ auth: { currentUser: { uid: "uid-1" } } });
    expect(requireUid()).toBe("uid-1");
  });

  it("throws when there is no signed-in user", () => {
    getFirebase.mockReturnValue({ auth: { currentUser: null } });
    expect(() => requireUid()).toThrow("Tu sesión expiró. Inicia sesión nuevamente.");
  });
});
