import { describe, expect, it } from "vitest";
import { ROLES } from "@luminova/types";
import { boardHomeLayout, LAYOUT_ROLES, PRECEDENCE, type WidgetKey } from "./board-home-layout";

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

  it("every role's layout carries birthdays (chapter-wide, role-agnostic)", () => {
    expect(LAYOUT_ROLES.length).toBeGreaterThan(0);
    for (const role of LAYOUT_ROLES) {
      expect(boardHomeLayout([role])).toContain("birthdays");
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

  it("still falls back to the default when the caller has no roles at all", () => {
    expect(boardHomeLayout([])).toEqual(DEFAULT);
  });
});
