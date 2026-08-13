import { describe, expect, it } from "vitest";
import type { Role } from "@luminova/auth/roles";
import { computeMemberRoles } from "./compute-roles.js";

/** The two fields computeMemberRoles is allowed to read. Any other read means a liveness /
 *  role-doc input was threaded in — see the BLOCKING test at the bottom of this file.
 *
 *  Enforced at RUNTIME on purpose, not with a type-level assertion: beacon's tsconfig sets
 *  `exclude: ["src/**\/*.test.ts"]`, so `tsc --noEmit` never reads this file and a type pin
 *  here would gate nothing. */
const ALLOWED_INPUT_FIELDS = new Set(["trustedGrants", "hadScanner"]);

function sealedInput(input: { trustedGrants: Role[]; hadScanner: boolean }) {
  const reject = (key: string | symbol) => {
    if (typeof key === "string" && !ALLOWED_INPUT_FIELDS.has(key)) {
      throw new Error(`computeMemberRoles touched a non-pure input field: ${key}`);
    }
  };
  return new Proxy(input, {
    get(target, key, receiver) {
      reject(key);
      return Reflect.get(target, key, receiver);
    },
    has(target, key) {
      reject(key);
      return Reflect.has(target, key);
    },
  });
}

describe("computeMemberRoles", () => {
  it("always includes Member", () => {
    expect(computeMemberRoles({ trustedGrants: [], hadScanner: false })).toEqual(["Member"]);
  });
  it("unions trusted grants with Member, in ROLES order, deduped", () => {
    expect(
      computeMemberRoles({
        trustedGrants: ["Membership", "Admin", "Membership"],
        hadScanner: false,
      }),
    ).toEqual(["Admin", "Membership", "Member"]);
  });
  it("preserves Scanner when previously present", () => {
    expect(computeMemberRoles({ trustedGrants: ["Treasury"], hadScanner: true })).toEqual([
      "Treasury",
      "Scanner",
      "Member",
    ]);
  });

  /** BLOCKING — DO NOT delete or "simplify" this, and do not make it pass by widening
   *  ALLOWED_INPUT_FIELDS. It is the ONLY guard on a deliberate residual.
   *
   *  This function is pure over exactly `{trustedGrants, hadScanner}` and reads NO role doc.
   *  That is precisely WHY a deactivated role's NAME survives in the `roles` claim — the
   *  residual documented in docs/specs/role-lifecycle.md. It cannot be pinned at the rules
   *  layer: firestore.rules never reads a role doc, and the rules-test harness synthesizes
   *  the auth token from a static table, so no rules test can express it.
   *
   *  The rejected alternative — dropping names whose role doc is not live — is a PRIVILEGE
   *  ESCALATION, not a tightening: a member holding Scanner plus another `checkIn:Attendance`
   *  role would lose the `Scanner` name while keeping the perm, and thereby escape the
   *  Scanner-only `role == 'Attendee'` conjunct on the checkIns create and delete arms.
   *  Implementing it requires a liveness input here, in one of three shapes, and each is
   *  pinned below: a third input FIELD (the proxy throws on the read), an extra ARGUMENT (a
   *  throwing sentinel — `Function.length` alone does NOT catch it), or an async role-doc
   *  port (a non-array return). */
  it("BLOCKING: takes no role-doc/liveness input, so a deactivated role keeps its NAME", () => {
    const out = computeMemberRoles(
      sealedInput({ trustedGrants: ["ProjectManager"], hadScanner: true }),
    );

    // SHAPE 2 — an extra argument. `Function.length` is 1 for a bare single parameter, but
    // ALSO for `(input, docs = [])` and for `(input, ...rest)`, and a DEFAULTED second
    // parameter is precisely how someone would thread a liveness port in without touching
    // either existing call site. A 7-mutation sweep confirmed both shapes pass an arity-only
    // pin. So the real check is behavioral: pass a second argument that THROWS the moment it
    // is touched. A function that ignores its second parameter cannot observe the sentinel.
    const sentinel = new Proxy(
      {},
      {
        get: () => {
          throw new Error("computeMemberRoles read a second argument (liveness port)");
        },
        has: () => {
          throw new Error("computeMemberRoles probed a second argument (liveness port)");
        },
      },
    );
    const withExtraArg = computeMemberRoles as unknown as (...args: unknown[]) => unknown;
    expect(() =>
      withExtraArg(sealedInput({ trustedGrants: ["ProjectManager"], hadScanner: true }), sentinel),
    ).not.toThrow();
    // Arity still pins the REQUIRED-parameter shape, which is the one it does catch.
    expect(computeMemberRoles).toHaveLength(1);

    // SHAPE 3 — an async port. A role-doc read cannot be synchronous, so it would surface as
    // a thenable rather than an array. `Array.isArray` already fails for any Promise, so the
    // separate `not.toHaveProperty("then")` this used to carry could not add coverage.
    expect(Array.isArray(out)).toBe(true);

    // The escalation stated behaviorally: Scanner survives beside another
    // checkIn:Attendance role, whatever the roles/Scanner doc says.
    expect(out).toContain("Scanner");
  });

  /** POSITIVE CONTROL for SHAPE 1 of the BLOCKING test above. Without it the proxy could
   *  stop biting — an over-widened ALLOWED_INPUT_FIELDS, a `reject` that no longer throws, a
   *  dropped `get` trap — and that test would still pass, forever and silently. This asserts
   *  the MECHANISM, not the subject: reading a field the allow-list does not name must throw. */
  it("the purity proxy really bites (positive control for the BLOCKING test)", () => {
    const sealed = sealedInput({ trustedGrants: [], hadScanner: false });

    expect(() => (sealed as unknown as { roleDocs?: unknown }).roleDocs).toThrow(
      /non-pure input field: roleDocs/,
    );
    expect(() => "liveRoles" in sealed).toThrow(/non-pure input field: liveRoles/);
    // The allowed fields must still read through, or the proxy would "bite" by breaking
    // every call and the BLOCKING test would be passing for the wrong reason.
    expect(sealed.trustedGrants).toEqual([]);
    expect(sealed.hadScanner).toBe(false);
  });
});
