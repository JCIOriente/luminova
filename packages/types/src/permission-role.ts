export const ROLES = [
  "Admin",
  "Membership",
  "Treasury",
  "ExecutiveCommittee",
  "ProjectManager",
  "Scanner",
  "Member",
] as const;

export type Role = (typeof ROLES)[number];

export function isValidRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
