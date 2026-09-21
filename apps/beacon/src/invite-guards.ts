import { isSafeDocId } from "./firestore-util.js";

/** The pure predicates behind the invite guards, in a module the RULES-TEST package can
 *  import.
 *
 *  Same split, and the same reason, as `assignable-cargo-core.ts`: `tests/firestore-rules/`
 *  cannot resolve `@luminova/types` for value, so a parity test can only import a module whose
 *  runtime imports it can follow. `./firestore-util.js` and `@luminova/auth/roles` both
 *  resolve there (verified); `@luminova/types` does not, so nothing here may import it for
 *  value — TYPE-ONLY across that boundary.
 *
 *  These decide whether a `create:MemberLogin` delegate may mint a link for a given member.
 *  They are evaluated TWICE: once in `issueMemberInvite`, and again in `redeemInvite`, because
 *  the token outlives the authorization decision by up to seven days. */

/** Claims carried over when ADOPTING an Auth account not currently linked to the member. An
 *  orphaned account may still hold org roles (even Admin); only these survive, everything else
 *  must be re-earned through claims-sync.
 *
 *  Deliberately NOT shared with NON_PRIVILEGED_ROLES below. The two answer different
 *  questions, and a test asserts their present equality rather than the type system welding
 *  them together — see that test for why. */
export const ADOPTABLE_ROLES = ["Member", "Scanner"] as const;

/** Roles an account may hold and still be considered ordinary enough for a delegate to
 *  recover.
 *
 *  Equal to ADOPTABLE_ROLES today, and must be free to diverge: `Scanner` holds
 *  `checkIn:Attendance`, so a delegate impersonating a Scanner can award points. If the
 *  adoption allowlist is ever widened, that must not silently widen who a delegate may take
 *  over. */
export const NON_PRIVILEGED_ROLES = ["Member", "Scanner"] as const;

/** Whether this member carries DIRECT grants — a custom role or a per-member override.
 *
 *  One half of the privileged-member question. syncMemberClaims mints from two independent
 *  sources: trusted cargo grants become `roles`, and `roleIds` + `permissionOverrides` become
 *  `perms` (resolveMemberPerms). A guard reading only the cargo half leaves the other wide
 *  open — and `roleIds`/`permissionOverrides` are exactly what the Admin-only panel writes.
 *
 *  Fails CLOSED on any shape that is not a clean empty: a present-but-unparseable `roleIds`
 *  must refuse, not read as "no grants". Absent and null are the genuine empties — the rules'
 *  unchanged()/touched() gap admits an explicit null, and parseMember resolves that to []. */
export function hasDirectGrants(member: Record<string, unknown>): boolean {
  const roleIds = member.roleIds;
  if (roleIds !== undefined && roleIds !== null) {
    if (!Array.isArray(roleIds)) return true;
    if (roleIds.length > 0) return true;
  }
  const overrides = member.permissionOverrides;
  if (overrides === undefined || overrides === null) return false;
  // Array before the typeof: `typeof [] === "object"`, so a legacy/console
  // `permissionOverrides: ["manage:all"]` would reach `.grant === undefined` and read as
  // ungranted — failing OPEN, which is what the roleIds branch above refuses to do.
  if (Array.isArray(overrides) || typeof overrides !== "object") return true;
  const grant = (overrides as { grant?: unknown }).grant;
  if (grant === undefined || grant === null) return false;
  if (!Array.isArray(grant)) return true;
  return grant.length > 0;
}

/** Every cargo id in the member's positions map, for the power-seat guard.
 *
 *  EVERY term, not just the current one — and that is the point. `syncMemberClaims` reads
 *  `positions[currentTermKey()]` at TRIGGER time, so a future-term entry is invisible today
 *  and mints on the UTC-year rollover. All client write lanes are term-pinned, so such a map
 *  takes a console edit, an admin-SDK write or a legacy migration.
 *
 *  Yields:
 *    a usable id   — read its grants.
 *    ""            — present but unreadable (a non-object entry, a non-string or empty
 *                    cargoId, or an id `isSafeDocId` rejects). Deliberately NOT skipped: ""
 *                    fails `isSafeDocId` at the port too, so the guard refuses. A malformed
 *                    shape must never read as "no cargo" — that is the guard's own bypass.
 *  A genuinely absent cargo yields nothing, so an unseated member produces an empty list. */
export function readCargoIds(member: Record<string, unknown>): string[] {
  const positions = member.positions;
  if (positions === undefined || positions === null) return [];
  if (typeof positions !== "object") return [""];
  const ids: string[] = [];
  for (const term of Object.values(positions as Record<string, unknown>)) {
    if (term === undefined || term === null) continue;
    if (typeof term !== "object") {
      ids.push("");
      continue;
    }
    const cargoId = (term as { cargoId?: unknown }).cargoId;
    if (cargoId === undefined || cargoId === null) continue;
    if (typeof cargoId !== "string" || cargoId.length === 0) {
      ids.push("");
      continue;
    }
    ids.push(isSafeDocId(cargoId) ? cargoId : "");
  }
  return [...new Set(ids)];
}

/** Whether a LIVE AUTH ACCOUNT is too powerful for a delegate to take over.
 *
 *  The guard the member-doc checks cannot cover. `hasDirectGrants` and `readCargoIds` read the
 *  member DOCUMENT; recovery targets an Auth account, which can carry claims the document does
 *  not explain — an orphaned Admin claim, or claims minted before a cargo was removed
 *  (syncMemberClaims does not recompute on cargo removal until the next member write).
 *
 *  ABSENT claims are a genuine empty, NOT a refusal. Firebase returns `customClaims ===
 *  undefined` when none are set, and the entire pre-existing roster predates this feature —
 *  failing closed on absent would make D3 dead for exactly the membership it is meant to
 *  serve. MALFORMED is fail-closed. Absent is not malformed, and the distinction is tested. */
export function accountIsPrivileged(claims: Record<string, unknown> | undefined): boolean {
  if (claims === undefined || claims === null) return false;
  if (typeof claims !== "object" || Array.isArray(claims)) return true;

  // `roles` and `perms` are the COMPLETE key set beacon ever mints (nextClaims, setUserRoles
  // and syncMemberClaims are the only three setCustomUserClaims sites). A key beyond them is
  // something this build cannot evaluate, and the whole job of this function is to answer
  // "is this account too powerful for a delegate to take over" — so an unknown key is
  // privileged, for the same fail-closed reason a malformed one is.
  for (const key of Object.keys(claims)) {
    if (key !== "roles" && key !== "perms") return true;
  }

  const roles = (claims as { roles?: unknown }).roles;
  if (roles !== undefined && roles !== null) {
    if (!Array.isArray(roles)) return true;
    const allowed = new Set<unknown>(NON_PRIVILEGED_ROLES);
    if (roles.some((r) => !allowed.has(r))) return true;
  }

  const perms = (claims as { perms?: unknown }).perms;
  if (perms !== undefined && perms !== null) {
    if (!Array.isArray(perms)) return true;
    if (perms.length > 0) return true;
  }
  return false;
}
