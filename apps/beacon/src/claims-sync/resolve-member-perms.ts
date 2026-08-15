import type { Role } from "@luminova/auth/roles";
import { resolveBuiltInPerms, type BuiltInRoleDoc } from "@luminova/auth/built-in-perms";
import type { PermissionCode, RoleDefinition } from "@luminova/types";

/** The beacon-local name for the shared `BuiltInRoleDoc` port — an ALIAS, not a restatement,
 *  so the compiler couples them and the `live`-not-`active` rationale lives in one docblock
 *  (`@luminova/auth/built-in-perms`). */
export type LiveBuiltInRoleDoc = BuiltInRoleDoc;

export interface RolePermsDeps {
  /** EVERY built-in role doc matching these keys by builtInKey — live AND not-live.
   *  Returning the not-live ones is load-bearing: they contribute no perms but they do
   *  COVER their key, which is the only thing that tells "deactivated" apart from
   *  "never seeded". Filter them out here and a deactivation silently restores the
   *  seed snapshot through the fallback below. */
  getRoleDocsByBuiltInKeys(keys: Role[]): Promise<readonly LiveBuiltInRoleDoc[]>;
  /** Custom role docs by id — ACTIVE only. There is no fallback on this path, so
   *  dropping an inactive doc already yields zero perms. */
  getRolesByIds(ids: string[]): Promise<Pick<RoleDefinition, "permissions">[]>;
}

/** Resolve a member's effective coarse perms from every source: the live perms of
 *  the built-in roles they hold (via positions), their directly-assigned custom
 *  roles, and their per-member overrides.
 *
 *  This function owns the FETCH orchestration only; the absent/live/inactive three-way
 *  — including the `BUILT_IN_ROLE_PERMS` fallback — lives in `resolveBuiltInPerms`
 *  (`@luminova/auth/built-in-perms`), shared with the backstage assignment preview so the
 *  admin authorizes from the same resolution beacon then mints. `PERMISSION_CAP` stays out
 *  of the shared half: this side fail-closes to `perms: []` in `sync.ts`, backstage blocks
 *  Save. Liveness DERIVATION also stays here — `isActiveRoleDoc` is fail-open where the
 *  backstage mirror is fail-closed, so the two are not one function — and only its
 *  consumption is shared.
 *
 *  The two fetches are INDEPENDENT and run concurrently, and the saving is ONE round-trip
 *  overlap per fresh deps instance — not one per member. `firestoreClaimsDeps` memoizes the
 *  built-in query per instance and `onRoleWritten` holds ONE instance for its whole fan-out,
 *  so from the second member onward `getRoleDocsByBuiltInKeys` returns an already-settled
 *  promise: a microtask, not a round trip. What `Promise.all` actually buys is the first
 *  member of a fan-out and every `onMemberWritten` invocation (one instance, one member).
 *  Cheap and correct, but it is not what keeps the 540 s / `retry: false` fan-out inside its
 *  budget — the memo is. The `.length ? … : []` short-circuits are preserved: an empty input
 *  must still skip its query outright (pinned by a test in this file's suite).
 *
 *  Two production callers inherit this: claims-sync/sync.ts (the onMemberWritten /
 *  onRoleWritten trigger) and set-user-roles.ts (the setUserRoles admin callable). */
export async function resolveMemberPerms(
  deps: RolePermsDeps,
  builtInRoleNames: Role[],
  roleIds: string[],
  overrides: { grant: PermissionCode[]; revoke: PermissionCode[] },
): Promise<PermissionCode[]> {
  const [builtInDocs, customDocs] = await Promise.all([
    builtInRoleNames.length ? deps.getRoleDocsByBuiltInKeys(builtInRoleNames) : [],
    roleIds.length ? deps.getRolesByIds(roleIds) : [],
  ]);
  return resolveBuiltInPerms({ builtInRoleNames, builtInDocs, customDocs, overrides });
}
