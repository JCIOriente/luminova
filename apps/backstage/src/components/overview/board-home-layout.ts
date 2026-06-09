import type { Role } from "@luminova/auth/roles";

export type WidgetKey =
  | "headerActions"
  | "kpis"
  | "chart"
  | "upcomingEvents"
  | "recentActivity"
  | "quickActions";

const DEFAULT_LAYOUT: WidgetKey[] = [
  "headerActions",
  "kpis",
  "chart",
  "upcomingEvents",
  "recentActivity",
  "quickActions",
];

// Which role's layout wins when a user has several (display precedence, not authority).
const PRECEDENCE: Role[] = [
  "Admin",
  "ExecutiveCommittee",
  "Treasury",
  "ProjectManager",
  "Membership",
];

const ROLE_LAYOUTS: Partial<Record<Role, WidgetKey[]>> = {
  Admin: DEFAULT_LAYOUT,
  Membership: ["headerActions", "kpis", "quickActions", "recentActivity", "chart", "upcomingEvents"],
  Treasury: ["kpis", "recentActivity", "chart"],
  ProjectManager: ["upcomingEvents", "quickActions", "kpis", "recentActivity"],
  ExecutiveCommittee: ["kpis", "recentActivity", "chart"],
};

export function boardHomeLayout(roles: readonly Role[]): WidgetKey[] {
  const known = roles.filter((r) => ROLE_LAYOUTS[r] !== undefined);
  if (known.length === 0) return [...DEFAULT_LAYOUT];

  const lead = PRECEDENCE.find((r) => known.includes(r));
  const leadLayout = lead ? ROLE_LAYOUTS[lead]! : DEFAULT_LAYOUT;

  const visible = new Set<WidgetKey>();
  for (const r of known) for (const w of ROLE_LAYOUTS[r]!) visible.add(w);

  const ordered = leadLayout.filter((w) => visible.has(w));
  for (const w of DEFAULT_LAYOUT) {
    if (visible.has(w) && !ordered.includes(w)) ordered.push(w);
  }
  return ordered;
}
