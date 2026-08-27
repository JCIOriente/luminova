import { describe, expect, it } from "vitest";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { callerIsAdmin, requireAdmin, requireAdminOrPerm } from "./callable-auth.js";

/** A callable request carrying just the claim shape the gates read. The cast is test-only
 *  and justified: CallableRequest carries rawRequest/acceptsStreaming/etc. that no gate
 *  touches, and building them would assert nothing. */
function req(token?: Record<string, unknown>): CallableRequest {
  return (token === undefined ? {} : { auth: { uid: "u", token } }) as unknown as CallableRequest;
}

function codeOf(fn: () => void): string {
  try {
    fn();
  } catch (err) {
    return err instanceof HttpsError ? err.code : "not-an-https-error";
  }
  return "no-throw";
}

describe("requireAdmin", () => {
  it("rejects an unauthenticated caller", () => {
    expect(codeOf(() => requireAdmin(req()))).toBe("unauthenticated");
  });
  it("rejects a signed-in non-Admin", () => {
    expect(codeOf(() => requireAdmin(req({ roles: ["Member"] })))).toBe("permission-denied");
  });
  it("accepts an Admin", () => {
    expect(codeOf(() => requireAdmin(req({ roles: ["Admin", "Member"] })))).toBe("no-throw");
  });
  it("rejects a manage:all perm holder who is not Admin by role", () => {
    // requireAdmin is a ROLE gate; the wildcard perm has never satisfied it and must not
    // start now that a sibling gate reads perms from the same token.
    expect(codeOf(() => requireAdmin(req({ roles: ["Member"], perms: ["manage:all"] })))).toBe(
      "permission-denied",
    );
  });
});

describe("requireAdminOrPerm", () => {
  it("rejects an unauthenticated caller", () => {
    expect(codeOf(() => requireAdminOrPerm(req(), "create:MemberLogin"))).toBe("unauthenticated");
  });

  it("accepts an Admin carrying no perms claim at all", () => {
    // The role disjunct must stand alone — an Admin whose perms claim has not been minted
    // yet (or was fail-closed to empty by the cap) still passes.
    expect(codeOf(() => requireAdminOrPerm(req({ roles: ["Admin"] }), "create:MemberLogin"))).toBe(
      "no-throw",
    );
  });

  it("accepts a non-Admin holding the exact code", () => {
    expect(
      codeOf(() =>
        requireAdminOrPerm(
          req({ roles: ["Member"], perms: ["create:MemberLogin"] }),
          "create:MemberLogin",
        ),
      ),
    ).toBe("no-throw");
  });

  it("BLOCKING: manage:all does NOT satisfy it", () => {
    // Exact-code, mirroring firestore.rules' hasPerm(). A canDo-style expansion here would
    // hand the delegation to every wildcard holder silently.
    expect(
      codeOf(() =>
        requireAdminOrPerm(req({ roles: ["Member"], perms: ["manage:all"] }), "create:MemberLogin"),
      ),
    ).toBe("permission-denied");
  });

  it("BLOCKING: manage:MemberLogin does NOT satisfy create:MemberLogin", () => {
    // The subject wildcard is equally inert — the gate is the literal code, not canDo().
    expect(
      codeOf(() =>
        requireAdminOrPerm(
          req({ roles: ["Member"], perms: ["manage:MemberLogin"] }),
          "create:MemberLogin",
        ),
      ),
    ).toBe("permission-denied");
  });

  it("keeps the two delegations independent", () => {
    // A board-seat delegate is not a login provisioner and vice versa. Pinned because both
    // codes ship together and the obvious future mistake is to conflate them.
    expect(
      codeOf(() =>
        requireAdminOrPerm(
          req({ roles: ["Member"], perms: ["update:BoardSeat"] }),
          "create:MemberLogin",
        ),
      ),
    ).toBe("permission-denied");
  });

  it("fails closed on a malformed perms claim", () => {
    // A string (or anything non-array) reads as empty rather than throwing — a malformed
    // token must deny, not 500.
    expect(
      codeOf(() =>
        requireAdminOrPerm(
          req({ roles: ["Member"], perms: "create:MemberLogin" }),
          "create:MemberLogin",
        ),
      ),
    ).toBe("permission-denied");
  });
});

describe("callerIsAdmin", () => {
  it("is false for an unauthenticated caller and for a wildcard perm holder", () => {
    expect(callerIsAdmin(req())).toBe(false);
    expect(callerIsAdmin(req({ roles: ["Member"], perms: ["manage:all"] }))).toBe(false);
  });
  it("is true only for the Admin role", () => {
    expect(callerIsAdmin(req({ roles: ["Admin"] }))).toBe(true);
  });
});
