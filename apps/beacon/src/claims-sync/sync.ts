import type { Role } from "@luminova/auth/roles";
import type { TermPositions } from "@luminova/types";
import { computeMemberRoles } from "./compute-roles.js";

export interface ClaimsSyncDeps {
  /** Catalog position by id, or null if missing/deleted. */
  getPosition(id: string): Promise<{ grants: Role[] } | null>;
  /** The assigner's current claim roles (for the power-grant trust gate). */
  getUserRoles(uid: string): Promise<Role[]>;
  /** The target member's existing custom claims. */
  getExistingClaims(uid: string): Promise<{ roles: Role[]; scannerEventIds?: string[] }>;
  setClaims(uid: string, claims: { roles: Role[]; scannerEventIds?: string[] }): Promise<void>;
}

type MemberLike = { uid?: string; positions?: Record<string, TermPositions> };

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
      assignerIsAdmin = assignedBy ? (await deps.getUserRoles(assignedBy)).includes("Admin") : false;
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
  a: { roles: Role[]; scannerEventIds?: string[] },
  b: { roles: Role[]; scannerEventIds?: string[] },
): boolean {
  return sameList(a.roles, b.roles) && sameList(a.scannerEventIds ?? [], b.scannerEventIds ?? []);
}

/** Recompute custom claims for a member from their current-term positions.
 *  No-op when unprovisioned or when the computed claims already match (idempotent;
 *  avoids a self-retrigger storm — note this writes Auth claims, NOT the member doc). */
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
  const next =
    hadScanner && existing.scannerEventIds
      ? { roles, scannerEventIds: existing.scannerEventIds }
      : { roles };

  // Order-independent compare: `existing` claims come from Auth and may not be in
  // canonical ROLES order, so a set/membership compare avoids a redundant write.
  if (sameClaims(existing, next)) return;
  await deps.setClaims(member.uid, next);
}
