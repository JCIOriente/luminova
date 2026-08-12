import { describe, expect, it } from "vitest";
import { ROLES } from "@luminova/types";
import { buildAbility } from "@luminova/auth/ability";
import { roleClaims } from "@luminova/auth/test-helpers";
import type { Role } from "@luminova/auth/roles";
import { buildCan } from "../../lib/authz/use-can";
import { boardHomeLayout, LAYOUT_ROLES, PRECEDENCE, type WidgetKey } from "./board-home-layout";

// The exact question DashboardPage asks before enabling the members query — collection
// level, so a conditional own-doc grant cannot answer it. Deriving the split from the
// ability rather than a hand-written role list means a permission change moves this test.
function canReadMembers(role: Role): boolean {
  const claims = roleClaims(role);
  return buildCan(buildAbility(claims, "u"), claims).can("read", "Member");
}

const DEFAULT: WidgetKey[] = [
  "headerActions",
  "kpis",
  "chart",
  "upcomingEvents",
  "birthdays",
  "recentActivity",
  "quickActions",
];

describe("boardHomeLayout", () => {
  it("Admin gets the full default layout", () => {
    expect(boardHomeLayout(["Admin"])).toEqual(DEFAULT);
  });

  it("Membership leads members-first, keeps quick actions", () => {
    expect(boardHomeLayout(["Membership"])).toEqual([
      "headerActions",
      "kpis",
      "quickActions",
      "birthdays",
      "recentActivity",
      "chart",
      "upcomingEvents",
    ]);
  });

  it("BLOCKING: birthdays is listed by exactly the roles whose members read can run", () => {
    // `birthdays` is wholly members-derived (dashboard-model) and OverviewView drops the
    // card when it is null, so listing it for a read:Member-less role promised a widget
    // that provably never paints — ActivityManager's layout was three keys and rendered
    // one card. The layout must not claim more than the principal can see.
    const reading = LAYOUT_ROLES.filter(canReadMembers);
    const blind = LAYOUT_ROLES.filter((r) => !canReadMembers(r));
    expect(reading.length).toBeGreaterThan(0);
    expect(blind.length).toBeGreaterThan(0);
    for (const role of reading) {
      expect(boardHomeLayout([role]), role).toContain("birthdays");
    }
    for (const role of blind) {
      expect(boardHomeLayout([role]), role).not.toContain("birthdays");
    }
  });

  it("the union restores birthdays when a members-blind role rides on top of Member", () => {
    // Scanner holds no read:Member of its own, but in production it is always paired with
    // Member. The widget union — not a birthdays entry in Scanner's own layout — is what
    // brings the card back, so removing it above costs the real principal nothing.
    expect(boardHomeLayout(["Scanner"])).not.toContain("birthdays");
    expect(boardHomeLayout(["Scanner", "Member"])).toContain("birthdays");
  });

  it("every listed widget can paint: no layout is empty or down to a lone card", () => {
    for (const role of LAYOUT_ROLES) {
      expect(boardHomeLayout([role]).length, role).toBeGreaterThan(1);
    }
  });

  it("Treasury hides member quick actions and header create buttons", () => {
    const out = boardHomeLayout(["Treasury"]);
    expect(out).not.toContain("quickActions");
    expect(out).not.toContain("headerActions");
    expect(out[0]).toBe("kpis");
  });

  it("ProjectManager leads with events/projects, drops member admin actions", () => {
    const out = boardHomeLayout(["ProjectManager"]);
    expect(out[0]).toBe("upcomingEvents");
    expect(out).toContain("quickActions");
    expect(out).not.toContain("headerActions");
  });

  it("ExecutiveCommittee is read-only: no quick actions, no header buttons", () => {
    const out = boardHomeLayout(["ExecutiveCommittee"]);
    expect(out).not.toContain("quickActions");
    expect(out).not.toContain("headerActions");
    expect(out).toContain("kpis");
  });

  it("multi-role uses highest-precedence layout, unions visible widgets", () => {
    const out = boardHomeLayout(["Membership", "Treasury"]);
    expect(out[0]).toBe("kpis");
    expect(out).toContain("quickActions");
  });

  it("every ROLES key carries its own layout (no role falls through to the full admin default)", () => {
    // The old Partial<Record> meant an unlisted role got DEFAULT_LAYOUT — the FULL admin
    // dashboard, KPI + chart included, for someone who may not be allowed to run those
    // queries. Exhaustiveness is now a compile error; this pins the runtime side too.
    expect([...LAYOUT_ROLES].sort()).toEqual([...ROLES].sort());
    for (const role of ROLES) {
      if (role === "Admin") continue; // Admin's layout IS the full default, by design.
      expect(boardHomeLayout([role]), role).not.toEqual(DEFAULT);
    }
  });

  it("PRECEDENCE ranks every ROLES key exactly once", () => {
    // boardHomeLayout picks the lead layout from PRECEDENCE; a role missing from it can
    // never lead, so a user holding only that role silently borrows another's ordering.
    expect([...PRECEDENCE].sort()).toEqual([...ROLES].sort());
  });

  it("BLOCKING: a roleless principal gets the Member layout, never the admin default", () => {
    // Claims that never minted (member doc without `uid`, a failed claims-sync, a token
    // whose `roles` is not an array) decode to []. isMemberOnly requires the Member role,
    // so they are NOT bounced to /me — they land here. DEFAULT_LAYOUT gave them the full
    // admin dashboard with every capability-gated query disabled, i.e. fabricated zeros.
    expect(boardHomeLayout([])).not.toEqual(DEFAULT);
    expect(boardHomeLayout([])).toEqual(boardHomeLayout(["Member"]));
    expect(boardHomeLayout([])).not.toContain("kpis");
    expect(boardHomeLayout([])).not.toContain("chart");
    expect(boardHomeLayout([])).not.toContain("headerActions");
  });
});
