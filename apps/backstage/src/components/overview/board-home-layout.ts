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

// `birthdays` derives from the members read, so it belongs only to layouts whose role
// holds read:Member — see dashboard-model. Listing it for a role without that capability
// promised a card that can never paint.
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
  // No read:Member, so no birthdays; the KPI row still carries events, points and allies.
  ProjectManager: ["upcomingEvents", "quickActions", "kpis", "recentActivity"],
  ExecutiveCommittee: ["kpis", "birthdays", "recentActivity", "chart"],
  // Activity operations only (manage:Activity + checkIn:Attendance) — no member, points or
  // ally capability, so no KPI tile, no points chart and no birthdays.
  ActivityManager: ["upcomingEvents", "recentActivity"],
  // Communications: allies, prospects, notifications. quickActions carries "Registrar
  // aliado", which is theirs; kpis/chart read members + points, which they cannot.
  Secretary: ["upcomingEvents", "quickActions", "recentActivity"],
  // Scanner's own grant is activity read + check-in and nothing else. It rides on top of
  // Member in production, where the union restores the member-derived cards — but the
  // check-in operator is not who the KPI row, the points chart or the member quick actions
  // are for. The feed stays: it is activity- and initiative-derived for a members-blind
  // principal, so it paints on Scanner's own grant alone.
  Scanner: ["upcomingEvents", "recentActivity"],
  // A Member is bounced from / to /me by _app.index, so this is the degenerate landing
  // they should never reach; keep it to the two chapter-wide, read-only cards.
  Member: ["upcomingEvents", "birthdays"],
};

/** The roles that carry their own layout. Exported so the test that asserts the
 *  role-agnostic widgets iterates THIS list — a role added below can't silently
 *  escape the guard by being missing from a hand-written test fixture. */
export const LAYOUT_ROLES = Object.keys(ROLE_LAYOUTS) as Role[];

export function boardHomeLayout(roles: readonly Role[]): WidgetKey[] {
  const lead = PRECEDENCE.find((r) => roles.includes(r));
  // No recognized role means UNKNOWN authority, not full authority. `decodeClaims` drops
  // anything outside ROLES, so a token whose claims never minted — a member doc with no
  // `uid`, a failed claims-sync, a `roles` claim that is not an array — arrives here empty,
  // and `isMemberOnly` requires the Member role so it does not bounce them to /me either.
  // Returning DEFAULT_LAYOUT handed that user the full admin dashboard with every gated
  // query disabled: fabricated zeros end to end. The most restricted layout is the honest
  // answer. (PRECEDENCE is exhaustive over Role, so this branch is reachable only via the
  // empty set — the exhaustiveness test pins that.)
  if (!lead) return [...ROLE_LAYOUTS.Member];

  const visible = new Set<WidgetKey>();
  for (const r of roles) for (const w of ROLE_LAYOUTS[r]) visible.add(w);

  const ordered = ROLE_LAYOUTS[lead].filter((w) => visible.has(w));
  for (const w of DEFAULT_LAYOUT) {
    if (visible.has(w) && !ordered.includes(w)) ordered.push(w);
  }
  return ordered;
}
