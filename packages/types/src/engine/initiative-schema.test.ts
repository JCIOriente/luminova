import { describe, expect, it } from "vitest";
import { initiativeFormSchema } from "./initiative-schema";

const base = {
  title: "Proyecto Aurora",
  roster: { directorId: "m1", coDirectorId: null, teamIds: [] as string[] },
  status: "Planificacion" as const,
};

describe("initiativeFormSchema", () => {
  it("accepts a minimal valid initiative", () => {
    expect(initiativeFormSchema.safeParse(base).success).toBe(true);
  });
  it("rejects a title under 3 chars", () => {
    expect(initiativeFormSchema.safeParse({ ...base, title: "ab" }).success).toBe(false);
  });
  it("requires a director", () => {
    const r = initiativeFormSchema.safeParse({
      ...base,
      roster: { ...base.roster, directorId: "" },
    });
    expect(r.success).toBe(false);
  });
  it("rejects co-director equal to director", () => {
    const r = initiativeFormSchema.safeParse({
      ...base,
      roster: { directorId: "m1", coDirectorId: "m1", teamIds: [] },
    });
    expect(r.success).toBe(false);
  });
  it("rejects director present in the team", () => {
    const r = initiativeFormSchema.safeParse({
      ...base,
      roster: { directorId: "m1", coDirectorId: null, teamIds: ["m1"] },
    });
    expect(r.success).toBe(false);
  });
  it("rejects co-director present in the team", () => {
    const r = initiativeFormSchema.safeParse({
      ...base,
      roster: { directorId: "m1", coDirectorId: "m2", teamIds: ["m2"] },
    });
    expect(r.success).toBe(false);
  });
  it("requires teamIds (no implicit default)", () => {
    const r = initiativeFormSchema.safeParse({
      title: "Proyecto Aurora",
      roster: { directorId: "m1", coDirectorId: null },
      status: "Planificacion",
    });
    expect(r.success).toBe(false);
  });
});
