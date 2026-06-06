import { describe, it, expect } from "vitest";
import { resolvePointRuleCode } from "./resolve-point-rule";

describe("resolvePointRuleCode", () => {
  it("maps director of a program/project/activity", () => {
    expect(
      resolvePointRuleCode({
        role: "Director",
        parentType: "Program",
        category: "ProjectExecution",
      }),
    ).toBe("DirectProgram");
    expect(
      resolvePointRuleCode({
        role: "Director",
        parentType: "Project",
        category: "ProjectExecution",
      }),
    ).toBe("DirectProject");
    expect(resolvePointRuleCode({ role: "Director", parentType: null, category: "Assembly" })).toBe(
      "DirectActivity",
    );
  });

  it("maps co-director", () => {
    expect(
      resolvePointRuleCode({
        role: "CoDirector",
        parentType: "Program",
        category: "ProjectExecution",
      }),
    ).toBe("CoDirectProgram");
    expect(
      resolvePointRuleCode({
        role: "CoDirector",
        parentType: "Project",
        category: "ProjectExecution",
      }),
    ).toBe("CoDirectProject");
    expect(resolvePointRuleCode({ role: "CoDirector", parentType: null, category: "TM" })).toBe(
      "CoDirectActivity",
    );
  });

  it("maps team only for a parented initiative", () => {
    expect(
      resolvePointRuleCode({ role: "Team", parentType: "Program", category: "ProjectExecution" }),
    ).toBe("ProgramProjectTeam");
    expect(
      resolvePointRuleCode({ role: "Team", parentType: "Project", category: "ProjectExecution" }),
    ).toBe("ProgramProjectTeam");
    expect(
      resolvePointRuleCode({ role: "Team", parentType: null, category: "Assembly" }),
    ).toBeNull();
  });

  it("maps attendee by activity category", () => {
    expect(resolvePointRuleCode({ role: "Attendee", parentType: null, category: "Assembly" })).toBe(
      "AttendAssembly",
    );
    expect(resolvePointRuleCode({ role: "Attendee", parentType: null, category: "Course" })).toBe(
      "AttendCourse",
    );
    expect(
      resolvePointRuleCode({
        role: "Attendee",
        parentType: "Project",
        category: "ProjectExecution",
      }),
    ).toBe("AttendActivity");
    expect(
      resolvePointRuleCode({ role: "Attendee", parentType: null, category: "NationalEvent" }),
    ).toBe("AttendNationalEvent");
    expect(
      resolvePointRuleCode({ role: "Attendee", parentType: null, category: "Anniversary" }),
    ).toBe("AttendAnniversary");
    expect(resolvePointRuleCode({ role: "Attendee", parentType: null, category: "TM" })).toBe(
      "AttendTM",
    );
  });
});
