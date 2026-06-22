import type { Role } from "@luminova/auth/roles";
import type { TermPositions, PermissionCode } from "@luminova/types";
import { PERMISSION_CAP } from "@luminova/types/permission";
import { computeMemberRoles } from "./compute-roles.js";
import { resolveMemberPerms, type RolePermsDeps } from "./resolve-member-perms.js";

export interface MemberClaims {
  roles: Role[];
  perms: PermissionCode[];
  scannerEventIds?: string[];
}

export interface ClaimsSyncDeps extends RolePermsDeps {
  /** Catalog position by id, or null if missing/deleted. */
  getPosition(id: string): Promise<{ grants: Role[] } | null>;
  /** The assigner's current claim roles (for the power-grant trust gate). */
  getUserRoles(uid: string): Promise<Role[]>;
  /** The target member's existing custom claims. */
  getExistingClaims(
    uid: string,
  ): Promise<{ roles: Role[]; perms?: PermissionCode[]; scannerEventIds?: string[] }>;
  setClaims(uid: string, claims: MemberClaims): Promise<void>;
  /** Structured error sink (defaults to console.error in the Firestore impl). */
  logError?(message: string, meta: Record<string, unknown>): void;
}

type MemberLike = {
  uid?: string;
  positions?: Record<string, TermPositions>;
  roleIds?: string[];
  permissionOverrides?: { grant: PermissionCode[]; revoke: PermissionCode[] };
};

/** Union of grants from the term's positions, gating power-conferring positions
 *  (non-empty grants) on an Admin `assignedBy`. The assigner lookup is performed
 *  at most once and only when a power position is actually present.
 *
 *  The loop is intentionally sequential so that the early-exit (assignerIsAdmin =
 *  false stops accumulating grants) is preserved — parallel fetches would not
 *  short-circuit. `getUserRoles` reads the assigner's LIVE claims, so a later
 *  Firestore write that re-invokes this function re-evaluates trust: if the
 *  assigner has since lost Admin, their previously granted power positions are
 *  revoked and claims reflect current org state (by design). */
async function resolveTrustedGrants(
  deps: ClaimsSyncDeps,
  positionIds: string[],
  assignedBy: string | undefined,
): Promise<Role[]> {
  const grants = new Set<Role>();
  let assignerIsAdmin: boolean | null = null;
  for (const id of positionIds) {
    const position = await deps.getPosition(id);
    if (!position || position.grants.length === 0) continue;
    if (assignerIsAdmin === null) {
      assignerIsAdmin = assignedBy
        ? (await deps.getUserRoles(assignedBy)).includes("Admin")
        : false;
    }
    if (assignerIsAdmin) for (const grant of position.grants) grants.add(grant);
  }
  return [...grants];
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

function sameClaims(
  a: { roles: Role[]; perms?: PermissionCode[]; scannerEventIds?: string[] },
  b: MemberClaims,
): boolean {
  return (
    sameList(a.roles, b.roles) &&
    sameList(a.perms ?? [], b.perms) &&
    sameList(a.scannerEventIds ?? [], b.scannerEventIds ?? [])
  );
}

const EMPTY_OVERRIDES = { grant: [] as PermissionCode[], revoke: [] as PermissionCode[] };

/** Recompute custom claims for a member from their current-term positions, their
 *  directly-assigned custom roles, and per-member overrides. Writes both `roles`
 *  (built-in names, drive conditional rules) and the resolved coarse `perms` set.
 *  No-op when unprovisioned or when the computed claims already match (idempotent).
 *  Fail-closed on a cap breach: skips the write rather than truncating (truncation
 *  could drop a revoke and grant power). Writes Auth claims, NOT the member doc. */
export async function syncMemberClaims(
  deps: ClaimsSyncDeps,
  member: MemberLike,
  termKey: string,
): Promise<void> {
  if (!member.uid) return;
  const term = member.positions?.[termKey];
  const positionIds = term
    ? [term.cargoId, ...term.comisionIds].filter((id): id is string => id !== null && id.length > 0)
    : [];
  const trustedGrants = await resolveTrustedGrants(deps, positionIds, term?.assignedBy);

  const existing = await deps.getExistingClaims(member.uid);
  const hadScanner = existing.roles.includes("Scanner");
  const roles = computeMemberRoles({ trustedGrants, hadScanner });

  let perms = await resolveMemberPerms(
    deps,
    roles,
    member.roleIds ?? [],
    member.permissionOverrides ?? EMPTY_OVERRIDES,
  );
  if (perms.length > PERMISSION_CAP) {
    // Fail-closed: drop ALL coarse perms rather than truncate (truncation could
    // keep a stale grant while dropping a revoke). We still write the recomputed
    // `roles` + empty `perms` so a concurrent role revocation always lands —
    // never leave the member on stale, possibly-elevated claims.
    deps.logError?.("effective perms exceed cap; writing empty perms (fail-closed)", {
      uid: member.uid,
      count: perms.length,
      cap: PERMISSION_CAP,
    });
    perms = [];
  }

  const next: MemberClaims =
    hadScanner && existing.scannerEventIds
      ? { roles, perms, scannerEventIds: existing.scannerEventIds }
      : { roles, perms };

  // Order-independent compare: `existing` claims come from Auth and may not be in
  // canonical order, so a set/membership compare avoids a redundant write.
  if (sameClaims(existing, next)) return;
  await deps.setClaims(member.uid, next);
}
