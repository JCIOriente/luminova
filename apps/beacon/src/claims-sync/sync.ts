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
 *  at most once and only when a power position is actually present. */
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

function sameClaims(
  a: { roles: Role[]; scannerEventIds?: string[] },
  b: { roles: Role[]; scannerEventIds?: string[] },
): boolean {
  const sameRoles = a.roles.length === b.roles.length && a.roles.every((r, i) => r === b.roles[i]);
  const sa = a.scannerEventIds ?? [];
  const sb = b.scannerEventIds ?? [];
  const sameScanner = sa.length === sb.length && sa.every((s, i) => s === sb[i]);
  return sameRoles && sameScanner;
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
  const roles = computeMemberRoles({ trustedGrants, hadScanner: existing.roles.includes("Scanner") });
  const next =
    existing.roles.includes("Scanner") && existing.scannerEventIds
      ? { roles, scannerEventIds: existing.scannerEventIds }
      : { roles };

  if (sameClaims(existing, next)) return;
  await deps.setClaims(member.uid, next);
}
