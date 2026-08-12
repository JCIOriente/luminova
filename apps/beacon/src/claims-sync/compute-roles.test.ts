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
   *  pinned below: a third input FIELD (the proxy throws on the read), an extra PARAMETER
   *  (arity), or an async role-doc port (a Promise return). */
  it("BLOCKING: takes no role-doc/liveness input, so a deactivated role keeps its NAME", () => {
    const out = computeMemberRoles(
      sealedInput({ trustedGrants: ["ProjectManager"], hadScanner: true }),
    );

    expect(computeMemberRoles).toHaveLength(1);
    expect(Array.isArray(out)).toBe(true);
    // A role-doc read cannot be synchronous, so a thenable return is the async port arriving.
    expect(out).not.toHaveProperty("then");

    // The escalation stated behaviorally: Scanner survives beside another
    // checkIn:Attendance role, whatever the roles/Scanner doc says.
    expect(out).toContain("Scanner");
  });
});
