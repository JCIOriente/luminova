import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { ROLES, isValidRole, type Role } from "@luminova/auth/roles";
import { PERMISSION_CAP } from "@luminova/types/permission";
import { requireAdmin } from "./callable-auth.js";
import { firestoreClaimsDeps } from "./claims-sync/firestore-deps.js";
import { resolveMemberPerms } from "./claims-sync/resolve-member-perms.js";
import { ensureApp } from "./runtime.js";

export interface SetUserRolesInput {
  targetUid: string;
  roles: Role[];
}

interface RawInput {
  targetUid?: unknown;
  roles?: unknown;
}

/** Extra keys are ignored, not rejected: an older client may still send the removed
 *  `scannerEventIds`, and failing its call would break role assignment for no gain — the
 *  field is simply never written into the claim. */
export function validateSetRolesInput(data: unknown): SetUserRolesInput {
  const raw = (data ?? {}) as RawInput;

  if (typeof raw.targetUid !== "string" || raw.targetUid.length === 0) {
    throw new HttpsError("invalid-argument", "targetUid is required");
  }
  if (!Array.isArray(raw.roles) || raw.roles.length === 0) {
    throw new HttpsError("invalid-argument", "roles must be a non-empty array");
  }
  if (raw.roles.length > ROLES.length) {
    throw new HttpsError("invalid-argument", "roles exceeds the maximum allowed count");
  }
  for (const role of raw.roles) {
    if (!isValidRole(role)) {
      throw new HttpsError("invalid-argument", "one or more roles are invalid");
    }
  }
  const roles = [...new Set(raw.roles as Role[])];

  return { targetUid: raw.targetUid, roles };
}

/** Reject any requested role whose `roles/{key}` doc EXISTS and is deactivated — `live: false`,
 *  which is `isActiveRoleDoc` over BOTH `active` and `deletedAt`, never the raw `active` field.
 *
 *  Minting `perms: []` for it is not enough: this callable also writes the role NAME into
 *  the claim, and name-keyed rules gates read the name, not the perms — `canCurateFeatured()`
 *  and the Scanner `role == 'Attendee'` conjuncts among them. So without this check the
 *  callable is a path to NEWLY grant authority through a role the organization has taken out
 *  of service.
 *
 *  THIS CLOSES ONE OF TWO SUCH PATHS, both at the same privilege level. `computeMemberRoles`
 *  is pure over `{trustedGrants, hadScanner}` and reads no role doc, so `onMemberWritten`
 *  will NEWLY write a deactivated role's name into the claim of a member freshly assigned to
 *  a cargo whose `positions/{id}.grants` contain it — and `resolveTrustedGrants` honors those
 *  grants only when `assignedBy` holds Admin, which is the same authority this callable's
 *  `requireAdmin` demands. So the cargo-grants path stays open BY DESIGN (dropping names
 *  whose doc is not live is a privilege escalation via the Scanner conjunct — see the BLOCKING
 *  test in claims-sync/compute-roles.test.ts and the Residuals section of
 *  docs/specs/role-lifecycle.md). Do not read this guard as making a deactivated role's name
 *  ungrantable; it is not, and it is not the narrower "existing holders keep a name they
 *  already had" either.
 *
 *  An ABSENT doc must still be ACCEPTED. On a fresh project no built-in doc exists until
 *  seedRoles runs, and resolveMemberPerms deliberately falls back to BUILT_IN_ROLE_PERMS for
 *  exactly that window; rejecting here would make role assignment impossible pre-seed.
 *
 *  Fails closed on the duplicate-key anomaly (two docs, one key, one deactivated):
 *  firestore-deps logs it, and refusing to assign is the safe reading. */
export function assertRequestedRolesActive(
  roles: readonly Role[],
  docs: readonly { builtInKey: Role | null; live: boolean }[],
): void {
  const inactive = roles.filter((role) => docs.some((d) => d.builtInKey === role && !d.live));
  if (inactive.length === 0) return;
  throw new HttpsError(
    "failed-precondition",
    `role deactivated, cannot be assigned: ${inactive.join(", ")}`,
  );
}

export const setUserRoles = onCall(async (request) => {
  requireAdmin(request);

  const input = validateSetRolesInput(request.data);

  if (input.targetUid === request.auth?.uid) {
    throw new HttpsError("permission-denied", "cannot modify your own roles");
  }

  ensureApp();
  const auth = getAuth();
  const deps = firestoreClaimsDeps(getFirestore(), auth);
  // Before anything is minted: a deactivated role must not be assignable at all, because
  // the role NAME is granted regardless of the perms it resolves to. The read costs nothing
  // extra — deps memoize the built-in query, so resolveMemberPerms reuses this result.
  assertRequestedRolesActive(input.roles, await deps.getRoleDocsByBuiltInKeys(input.roles));
  // Resolve the coarse perms for these built-in roles so the `perms` claim stays
  // consistent with the position-driven trigger (rules gate on perms).
  const perms = await resolveMemberPerms(deps, input.roles, [], { grant: [], revoke: [] });
  if (perms.length > PERMISSION_CAP) {
    throw new HttpsError("internal", "resolved perms exceed the claim size cap");
  }

  await auth.setCustomUserClaims(input.targetUid, { roles: input.roles, perms });

  return { ok: true as const };
});
