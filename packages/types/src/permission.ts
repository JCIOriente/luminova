export const ACTIONS = ["manage", "create", "read", "update", "delete", "checkIn"] as const;
export type Action = (typeof ACTIONS)[number];

export const SUBJECTS = [
  "Member",
  "Ally",
  "Event",
  "PointRule",
  "MemberPoints",
  "Payment",
  "Attendance",
  "Program",
  "Project",
  "Activity",
  "Position",
  "Role",
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
