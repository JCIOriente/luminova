import { afterEach, describe, expect, it, vi } from "vitest";
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
    // A board-seat delegate is not a login provisioner and vice versa. Pins the gate against a
    // widening that keys on the subject FAMILY (e.g. "holds any MemberLogin/BoardSeat
    // delegation") — every other case here is same-subject and would still pass.
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
  it("is true for the Admin role", () => {
    expect(callerIsAdmin(req({ roles: ["Admin"] }))).toBe(true);
  });
});

describe("the debug bypass defeats these gates entirely, so they refuse first", () => {
  // THE EXPLOIT THIS CLOSES. With FIREBASE_DEBUG_MODE=true and a FIREBASE_DEBUG_FEATURES object
  // carrying skipTokenVerification, firebase-functions' `checkAuthToken` swaps
  // `getAuth().verifyIdToken` for `unsafeDecodeIdToken` — a JWT shape test, a base64 decode and
  // `uid = sub`, with NO signature check — then sets `ctx.auth = { uid, token }` and returns
  // "VALID". Everything these gates read is therefore attacker-authored: `roles: ["Admin"]` is
  // free to anyone who can reach the URL.
  //
  // Neither gate can tell a forged claim from a real one — the payload is identical. So the only
  // available defence is to refuse ALL traffic while the bypass is live, which is what
  // `assertTokenVerificationNotBypassed` does, and it must run BEFORE the claims are consulted.
  //
  // These five callables are what it protects: setUserRoles, seedRoles, recomputeAllClaims,
  // reseedBuiltInRolePerms, issueMemberInvite. They pass no options to `onCall`, so
  // `enforceAppCheck` defaults falsy and there is no attestation gate there to lose — the forged
  // claim is the ONLY gate. That makes the bypass strictly worse here than on the invite pair.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function underBypass<T>(body: () => T): T {
    vi.stubEnv("FIREBASE_DEBUG_MODE", "true");
    vi.stubEnv("FIREBASE_DEBUG_FEATURES", JSON.stringify({ skipTokenVerification: true }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      return body();
    } finally {
      error.mockRestore();
    }
  }

  it("refuses a FORGED Admin claim that would otherwise pass requireAdmin", () => {
    // Identical to the accepted case above except for the environment — which is the point:
    // the claim is indistinguishable, so the environment is the only thing left to key on.
    expect(codeOf(() => requireAdmin(req({ roles: ["Admin"] })))).toBe("no-throw");
    expect(underBypass(() => codeOf(() => requireAdmin(req({ roles: ["Admin"] }))))).toBe(
      "internal",
    );
  });

  it("refuses a FORGED perm claim that would otherwise pass requireAdminOrPerm", () => {
    expect(
      codeOf(() =>
        requireAdminOrPerm(req({ perms: ["create:MemberLogin"] }), "create:MemberLogin"),
      ),
    ).toBe("no-throw");
    expect(
      underBypass(() =>
        codeOf(() =>
          requireAdminOrPerm(req({ perms: ["create:MemberLogin"] }), "create:MemberLogin"),
        ),
      ),
    ).toBe("internal");
  });

  it("refuses BEFORE reading the claims, so an absent session is not what it reports", () => {
    // `internal`, not `unauthenticated`: the refusal is about the SERVER, and reporting it as a
    // missing session would send an operator hunting the caller instead of the environment.
    expect(underBypass(() => codeOf(() => requireAdmin(req())))).toBe("internal");
  });

  it("still serves normally when the bypass is inert", () => {
    // The predicate is the real condition, not the presence of the key names: a provably inert
    // FIREBASE_DEBUG_MODE=false must not take the admin surface down.
    vi.stubEnv("FIREBASE_DEBUG_MODE", "false");
    vi.stubEnv("FIREBASE_DEBUG_FEATURES", JSON.stringify({ skipTokenVerification: true }));
    expect(codeOf(() => requireAdmin(req({ roles: ["Admin"] })))).toBe("no-throw");
  });
});
