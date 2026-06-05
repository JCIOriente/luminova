import { describe, it, expect } from "vitest";
import type { User } from "firebase/auth";
import { authRedirect } from "./guard";

describe("authRedirect", () => {
  it("returns null when a user is present", () => {
    expect(authRedirect({ uid: "u1" } as User, "/members")).toBeNull();
  });

  it("returns a login redirect carrying the intended href when no user", () => {
    expect(authRedirect(null, "/members?page=2")).toEqual({
      to: "/login",
      search: { redirect: "/members?page=2" },
    });
  });
});
