import type { Role } from "@luminova/auth/roles";
import type { TermPositions, PermissionCode } from "@luminova/types";
import { PERMISSION_CAP } from "@luminova/types/permission";
import { isSafeDocId } from "../firestore-util.js";
import { computeMemberRoles } from "./compute-roles.js";
import { resolveMemberPerms, type RolePermsDeps } from "./resolve-member-perms.js";

export interface MemberClaims {
  roles: Role[];
  perms: PermissionCode[];
}

export interface ClaimsSyncDeps extends RolePermsDeps {
  /** Catalog position by id, or null if missing/deleted. */
  getPosition(id: string): Promise<{ grants: Role[] } | null>;
  /** The assigner's current claim roles AND perms (for the power-grant trust gate).
   *  Both, from one call: the gate asks a single question and two accessors would be two
   *  chances for a later edit to consult one and not the other. Deliberately not folded into
   *  `getExistingClaims` — the spy in sync.test.ts proves the gate is never REACHED on a
   *  grant-free cargo by asserting no assigner lookup happened, and a shared accessor would
   *  degrade that assertion to a uid-filtering heuristic. */
  getAssignerClaims(uid: string): Promise<{ roles: Role[]; perms: PermissionCode[] }>;
  /** The target member's existing custom claims. */
  getExistingClaims(uid: string): Promise<{ roles: Role[]; perms?: PermissionCode[] }>;
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

/** Grants from the term's CARGO only, gated on an Admin `assignedBy`. Comisiones
 *  never confer power: the catalog forbids Comision grants (schema + rules), and
 *  `comisionIds` is the one slot rules cannot grant-check (no array iteration), so
 *  honoring it would let a console-written power comisión — or a power cargo's id
 *  smuggled into comisionIds — mint claims. Ignoring it entirely also means a
 *  Ignoring it entirely also means a permitted non-Admin positions edit (which restamps
 *  the shared `assignedBy`) can no longer strip Admin-granted power. That last part was
 *  NOT true of the rules until currentCargoGrantsEmpty() landed: the rules denied
 *  ASSIGNING a power cargo, never OVERWRITING one, so a manage:Member holder could
 *  replace a president's cargo with a grant-free one and this function would resolve
 *  grants.length == 0. The old-side guard in positionsAssignmentSafe() is what makes the
 *  claim true; do not re-loosen it without re-reading this comment.
 *
 *  The assigner lookup runs only when the cargo actually confers power.
 *  `getAssignerClaims` reads the assigner's LIVE claims, so a later Firestore write
 *  that re-invokes this function re-evaluates trust: if the assigner has since
 *  lost Admin, their previously granted power cargo is revoked and claims
 *  reflect current org state (by design).
 *
 *  TWO trust sources, mirroring firestore.rules' boardSeatDelegate(): the Admin ROLE, or
 *  the exact `update:BoardSeat` PERM. The perm is not optional politeness — a delegate
 *  stamps their OWN uid into `assignedBy` (the rules' assignedBySelf()), so without it the
 *  seat lands, the member is published on the world-readable Directiva, and no claim is
 *  minted. Visible, powerless, and silent: half-working rather than safe.
 *
 *  CONFERRING ADMIN IS ADMIN-ONLY, and this is the guard the whole delegation rests on. A
 *  cargo whose grants include `Admin` is honored only for an assigner holding the Admin ROLE;
 *  every other cargo is honored for an `update:BoardSeat` delegate too.
 *
 *  Why the split rather than a self-assignment check (which is what this first shipped as):
 *  the danger is not reflexivity, it is that a delegate can mint an Admin AT ALL, because a
 *  minted Admin is itself a trust source and the delegation then cannot be revoked. Blocking
 *  only `assignedBy === memberUid` stops the one-write self-loop and not the two-write puppet
 *  loop — a delegate creates a second member on a mailbox they control, seats IT on
 *  Presidente (not a self-assignment, so the perm is trusted), and that puppet is Admin
 *  forever; revoking the delegate's code de-elevates nobody. It also had a worse problem: the
 *  seeded bootstrap president self-stamps `assignedBy` (tools/scripts/lib/seed-president.mjs)
 *  and their perms are `manage:all`, never the exact `update:BoardSeat` code — so the
 *  self-assignment form stripped the sitting president's Admin on their next member write.
 *
 *  Keying on the GRANT fixes both: no cargo-derived Admin can ever originate from a delegate,
 *  so there is no loop to close and no anchor to special-case, and an Admin seating anyone —
 *  including themselves — is untouched. Revocation is then real for everything a delegate
 *  CAN confer: strip the perm and the next write to that member drops the grants.
 *
 *  The cost, stated so nobody reads it as a bug: a delegate seating a member on an
 *  Admin-granting cargo publishes the seat but mints no claim. An Admin must re-stamp it. */
async function resolveTrustedGrants(
  deps: ClaimsSyncDeps,
  cargoId: string | null,
  assignedBy: string | undefined,
): Promise<Role[]> {
  // FULL screening, not just the empty-string half this used to check. `cargoId` comes
  // straight off the member doc and every implementation of `getPosition` interpolates it
  // into a `positions/${id}` doc-path template, where the admin SDK throws a PERMANENT
  // INVALID_ARGUMENT on a "/"-bearing or reserved id. positionsAssignmentSafe() in
  // firestore.rules never constrains cargoId's SHAPE, so an Admin can store "a/b"; and
  // onMemberWritten declares no `retry` option, so it is retry:false — the throw is not
  // redelivered, and because the bad id PERSISTS in the member doc, every later write to
  // that member re-throws. Their claims never sync again until someone edits the id out.
  // Screened HERE rather than in each port impl so the in-memory test fakes inherit it.
  // Fails closed in the right direction: no cargo means no grants.
  if (!isSafeDocId(cargoId)) return [];
  const position = await deps.getPosition(cargoId);
  if (!position || position.grants.length === 0) return [];
  if (!assignedBy) return [];
  const assigner = await deps.getAssignerClaims(assignedBy);
  const assignerIsAdmin = assigner.roles.includes("Admin");
  // Conferring ADMIN is reserved to an Admin, whoever assigned the cargo. Everything else a
  // board-seat delegate may confer.
  const trusted = position.grants.includes("Admin")
    ? assignerIsAdmin
    : assignerIsAdmin || assigner.perms.includes("update:BoardSeat");
  return trusted ? [...new Set(position.grants)] : [];
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

function sameClaims(a: { roles: Role[]; perms?: PermissionCode[] }, b: MemberClaims): boolean {
  return sameList(a.roles, b.roles) && sameList(a.perms ?? [], b.perms);
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
  const trustedGrants = await resolveTrustedGrants(deps, term?.cargoId ?? null, term?.assignedBy);

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
    // Note for update:BoardSeat holders: this takes their delegation with it, silently. A
    // delegate over the cap keeps seating (their cached token still passes the rules) while
    // this function stops honoring the grants — the seat publishes, no claim is minted.
    deps.logError?.("effective perms exceed cap; writing empty perms (fail-closed)", {
      uid: member.uid,
      count: perms.length,
      cap: PERMISSION_CAP,
    });
    perms = [];
  }

  const next: MemberClaims = { roles, perms };

  // Order-independent compare: `existing` claims come from Auth and may not be in
  // canonical order, so a set/membership compare avoids a redundant write.
  if (sameClaims(existing, next)) return;
  await deps.setClaims(member.uid, next);
}
