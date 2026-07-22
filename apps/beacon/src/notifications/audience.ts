export type Audience =
  | { type: "everyone" }
  | { type: "members" }
  | { type: "role"; roleId: string };

export function parseAudience(raw: unknown): Audience | null {
  if (typeof raw !== "object" || raw === null) return null;
  const a = raw as Record<string, unknown>;
  if (a.type === "everyone" || a.type === "members") return { type: a.type };
  if (a.type === "role" && typeof a.roleId === "string" && a.roleId.length > 0) {
    return { type: "role", roleId: a.roleId };
  }
  return null;
}

export function memberQueryFilter(
  a: Audience,
): { field: "roleIds"; op: "array-contains"; value: string } | null {
  return a.type === "role" ? { field: "roleIds", op: "array-contains", value: a.roleId } : null;
}

export function includesAnonTokens(a: Audience): boolean {
  return a.type === "everyone";
}
