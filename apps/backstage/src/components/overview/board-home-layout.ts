import type { Role } from "@luminova/auth/roles";

export type WidgetKey =
  | "headerActions"
  | "kpis"
  | "chart"
  | "upcomingEvents"
  | "birthdays"
  | "recentActivity"
  | "quickActions";

const DEFAULT_LAYOUT: WidgetKey[] = [
  "headerActions",
  "kpis",
  "chart",
  "upcomingEvents",
  "birthdays",
  "recentActivity",
  "quickActions",
];

// Which role's layout wins when a user has several (display precedence, not authority).
// Exhaustive over Role so `lead` is always found for a non-empty role set; the unit test
// pins it against ROLES.
export const PRECEDENCE: Role[] = [
  "Admin",
  "ExecutiveCommittee",
  "Treasury",
  "ProjectManager",
  "Membership",
  "Secretary",
  "ActivityManager",
  "Scanner",
  "Member",
];

// Birthdays are chapter-wide and role-agnostic — every layout carries them, so no
// board member's home is missing the one thing the whole chapter looks at.
//
// EXHAUSTIVE Record, not Partial: an unlisted role used to fall through to
// DEFAULT_LAYOUT, i.e. the full admin dashboard (KPIs + points chart) for someone who
// may hold no read:Member / read:MemberPoints at all. A missing key is now a compile
// error. Adding a role to ROLES forces a deliberate layout decision here.
const ROLE_LAYOUTS: Record<Role, WidgetKey[]> = {
  Admin: DEFAULT_LAYOUT,
  Membership: [
    "headerActions",
    "kpis",
    "quickActions",
    "birthdays",
    "recentActivity",
    "chart",
    "upcomingEvents",
  ],
  Treasury: ["kpis", "birthdays", "recentActivity", "chart"],
  ProjectManager: ["upcomingEvents", "birthdays", "quickActions", "kpis", "recentActivity"],
  ExecutiveCommittee: ["kpis", "birthdays", "recentActivity", "chart"],
  // Activity operations only (manage:Activity + checkIn:Attendance) — no member, points or
  // ally capability, so no KPI tile and no points chart.
  ActivityManager: ["upcomingEvents", "birthdays", "recentActivity"],
  // Communications: allies, prospects, notifications. quickActions carries "Registrar
  // aliado", which is theirs; kpis/chart read members + points, which they cannot.
  Secretary: ["upcomingEvents", "birthdays", "quickActions", "recentActivity"],
  // Scanner reads activities and nothing else — no member, points or ally capability,
  // so no KPI tile, no points chart, no member quick actions.
  Scanner: ["upcomingEvents", "birthdays"],
  // A Member is bounced from / to /me by _app.index, so this is the degenerate landing
  // they should never reach; keep it to the two chapter-wide, read-only cards.
  Member: ["upcomingEvents", "birthdays"],
};

/** The roles that carry their own layout. Exported so the test that asserts the
 *  role-agnostic widgets iterates THIS list — a role added below can't silently
 *  escape the guard by being missing from a hand-written test fixture. */
export const LAYOUT_ROLES = Object.keys(ROLE_LAYOUTS) as Role[];

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
