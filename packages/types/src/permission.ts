export const ACTIONS = ["manage", "create", "read", "update", "delete", "checkIn"] as const;
export type Action = (typeof ACTIONS)[number];

export const SUBJECTS = [
  "Member",
  "Ally",
  "PointRule",
  "MemberPoints",
  "Attendance",
  "Program",
  "Project",
  "Activity",
  "Position",
  "Role",
  "Lead",
  "Notification",
  // Public-site curation. What this gates is the `featured` flag on `projects`/`programs`
  // — NOT the beacon-owned `showcase` collection, which is `allow read: if true` with no
  // client write at all. The name is a slight misnomer kept because `featured` is the input
  // to that public projection.
  //
  // Only `update:Showcase` is live: firestore.rules' canCurateFeatured() is
  // `hasAnyRole(['Admin']) || hasPerm('update:Showcase')` — an EXACT code match, not
  // canDo(). So the other five codes gate nothing, and `manage:Showcase` in particular is
  // inert BECAUSE the gate is exact: there is no second, undocumented path to curation.
  // That inertness is the pre-existing condition of this vocabulary, not a new defect —
  // the /permisos matrix renders the full actions × subjects grid, so `checkIn:Member` and
  // dozens like it are already assignable and equally inert.
  "Showcase",
  "all",
] as const;
export type Subject = (typeof SUBJECTS)[number];

export type PermissionCode = `${Action}:${Subject}`;

export const ALL_PERMISSION_CODES: PermissionCode[] = ACTIONS.flatMap((action) =>
  SUBJECTS.map((subject) => `${action}:${subject}` as PermissionCode),
);

const VALID = new Set<string>(ALL_PERMISSION_CODES);

export function isValidPermissionCode(value: unknown): value is PermissionCode {
  return typeof value === "string" && VALID.has(value);
}

/** Max effective perms per member — keeps the encoded `perms` custom claim under
 *  Firebase's 1000-byte limit (longest code ~22B with quoting → ≥36 fit). */
export const PERMISSION_CAP = 30;
