import { describe, expect, it } from "vitest";
import { boardHomeLayout, type WidgetKey } from "./board-home-layout";

const DEFAULT: WidgetKey[] = [
  "headerActions",
  "kpis",
  "chart",
  "upcomingEvents",
  "birthdays",
  "recentActivity",
  "quickActions",
];

const KNOWN_ROLES = [
  "Admin",
  "Membership",
  "Treasury",
  "ProjectManager",
  "ExecutiveCommittee",
] as const;

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
    for (const role of KNOWN_ROLES) {
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

  it("empty roles fall back to default", () => {
    expect(boardHomeLayout([])).toEqual(DEFAULT);
  });

  it("unknown role falls back to default", () => {
    expect(boardHomeLayout(["Scanner"])).toEqual(DEFAULT);
  });
});
