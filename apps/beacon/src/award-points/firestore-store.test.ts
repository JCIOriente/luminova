import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { parseInitiativeWrite } from "./firestore-store.js";

describe("parseInitiativeWrite", () => {
  it("parses a roster + filed report into millis", () => {
    const filedAt = Timestamp.fromDate(new Date("2026-09-01T00:00:00Z"));
    const out = parseInitiativeWrite({
      termId: "2026",
      roster: { directorId: "d1", coDirectorId: "c1", teamIds: ["t1"] },
      finalReport: { filedAt, filedBy: "u1" },
    });
    expect(out).toEqual({
      termId: "2026",
      roster: { directorId: "d1", coDirectorId: "c1", teamIds: ["t1"] },
      reportFiled: true,
      filedAtMillis: filedAt.toMillis(),
    });
  });

  it("treats a null finalReport as not filed", () => {
    const out = parseInitiativeWrite({
      termId: "2026",
      roster: { directorId: "d1", coDirectorId: null, teamIds: [] },
      finalReport: null,
    });
    expect(out?.reportFiled).toBe(false);
    expect(out?.filedAtMillis).toBeNull();
  });

  it("returns null when termId is missing", () => {
    expect(
      parseInitiativeWrite({ roster: { directorId: "d1", coDirectorId: null, teamIds: [] } }),
    ).toBeNull();
  });

  it("defaults a missing roster to empty (so deletes still reconcile)", () => {
    const out = parseInitiativeWrite({ termId: "2026" });
    expect(out?.roster).toEqual({ directorId: "", coDirectorId: null, teamIds: [] });
  });

  it("rejects a termId that would break the composite id (/ or __)", () => {
    expect(parseInitiativeWrite({ termId: "a/b" })).toBeNull();
    expect(parseInitiativeWrite({ termId: "a__b" })).toBeNull();
  });

  it("drops roster member ids that aren't path-safe", () => {
    const out = parseInitiativeWrite({
      termId: "2026",
      roster: { directorId: "d/1", coDirectorId: "c__1", teamIds: ["ok", "bad__id", "a/b"] },
    });
    expect(out?.roster).toEqual({ directorId: "", coDirectorId: null, teamIds: ["ok"] });
  });

  it("tolerates non-object input", () => {
    expect(parseInitiativeWrite(undefined)).toBeNull();
    expect(parseInitiativeWrite(null)).toBeNull();
  });
});
