import {
  BUILT_IN_ROLE_PERMS,
  type Member,
  type PermissionCode,
  type Position,
  type Role,
  type RoleDefinition,
} from "@luminova/types";
import { builtInRoles, roleDisplay } from "../../../lib/role-display";
import { isLiveRole } from "../../../lib/role-lifecycle";
import { effectiveRoles } from "../../members/lib/member-permissions";

export interface RoleOverviewRow {
  /** The live `roles/{id}` doc, or `null` for a built-in key that has no seeded doc yet.
   *  The panel needs the doc to open the editor, so an unsynced row has no editor. */
  role: RoleDefinition | null;
  /** Doc id, or the `ROLES` key when unsynced. */
  id: string;
  builtInKey: Role | null;
  /** Display text already resolved through `roleDisplay` — never read `role.name` /
   *  `role.description` off the doc downstream, or a built-in whose seeded doc carries
   *  `description: ""` renders blank on one screen and the snapshot text on another. */
  label: string;
  description: string;
  permissions: PermissionCode[];
  /** Whether this role is currently minting perms. False for a doc that is `active:
   *  false` OR carries a `deletedAt` (beacon reads both). TRUE for an unsynced built-in:
   *  with no doc seeded, beacon's BUILT_IN_ROLE_PERMS fallback really is minting.
   *  An inactive row keeps its STORED `permissions` — the update lane still permits
   *  editing them, so the array is real and is exactly what a reactivation will grant. */
  active: boolean;
  /** Cargos whose `grants` confer this role. Always empty for a custom role. */
  grantingCargos: string[];
  holders: { id: string; name: string }[];
}

/** One row per role, unioning BOTH assignment paths: a built-in role arrives through a
 *  cargo's `grants` OR a direct `members.roleIds` entry naming its doc id (beacon's
 *  getRolesByIds resolves a built-in doc id, so that path really does mint its perms);
 *  a custom role only through `members.roleIds`.
 *
 *  A `ROLES` key with no seeded doc still gets a row: it is offered as a cargo grant and
 *  mints perms through beacon's BUILT_IN_ROLE_PERMS fallback, so leaving it off the page
 *  whose job is "who can do what" would hide a live power grant until someone reseeds. */
export function buildRoleOverview(
  roles: RoleDefinition[],
  positions: Position[],
  members: Member[],
  termKey: string,
): RoleOverviewRow[] {
  const positionsById = new Map(positions.map((position) => [position.id, position]));
  const memberRoles = members.map((member) => ({
    member,
    roles: effectiveRoles(member, positionsById, termKey),
  }));

  const grantingCargos = (key: Role | null): string[] =>
    key === null
      ? []
      : positions
          .filter((position) => position.active && position.grants.includes(key))
          .map((position) => position.title);

  const holders = (key: Role | null, id: string): { id: string; name: string }[] =>
    memberRoles
      .filter(
        ({ member, roles: effective }) =>
          (key !== null && effective.includes(key)) || (member.roleIds ?? []).includes(id),
      )
      .map(({ member }) => ({ id: member.id, name: member.name }));

  const seeded = roles.map((role): RoleOverviewRow => {
    const key = role.builtInKey;
    return {
      role,
      id: role.id,
      builtInKey: key,
      ...(key === null
        ? { label: role.name, description: role.description }
        : roleDisplay(key, roles)),
      permissions: role.permissions,
      active: isLiveRole(role),
      grantingCargos: grantingCargos(key),
      holders: holders(key, role.id),
    };
  });

  const unsynced = builtInRoles(roles)
    .filter(({ doc }) => doc === null)
    .map(
      ({ key }): RoleOverviewRow => ({
        role: null,
        id: key,
        builtInKey: key,
        ...roleDisplay(key, roles),
        permissions: BUILT_IN_ROLE_PERMS[key],
        active: true,
        grantingCargos: grantingCargos(key),
        // Deliberate over-report: with no doc seeded, beacon's getRolesByIds resolves
        // nothing for a `roleIds: [key]` holder, so only the cargo path actually mints
        // these perms today. Listing both paths errs toward showing a power grant that
        // isn't live rather than hiding one that is — and seeding the doc makes it live.
        holders: holders(key, key),
      }),
    );

  return [...seeded, ...unsynced];
}
