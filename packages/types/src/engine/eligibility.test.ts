import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  isExecutiveCommittee,
  wonBestMemberPreviousTerm,
  evaluateEligibility,
} from "./eligibility";
import type { Term } from "./term";

const ts = Timestamp.fromDate(new Date("2026-10-01T00:00:00Z"));

function term(overrides: Partial<Term> = {}): Term {
  return {
    id: "t2026",
    year: 2026,
    board: [
      { memberId: "cel-1", title: "Presidenta", isExecutiveCommittee: true },
      { memberId: "dir-1", title: "Director de Proyectos", isExecutiveCommittee: false },
    ],
    conventionDate: ts,
    pointsCutoffAt: ts,
    bestMemberId: null,
    status: "Activo",
    ...overrides,
  };
}

describe("isExecutiveCommittee", () => {
  it("is true for a member on the board with the CEL flag", () => {
    expect(isExecutiveCommittee("cel-1", term())).toBe(true);
  });
  it("is false for a non-CEL board member and for non-members", () => {
    expect(isExecutiveCommittee("dir-1", term())).toBe(false);
    expect(isExecutiveCommittee("ghost", term())).toBe(false);
  });
});

describe("wonBestMemberPreviousTerm", () => {
  it("is true when the previous term's winner is this member", () => {
    expect(wonBestMemberPreviousTerm("m-1", term({ bestMemberId: "m-1" }))).toBe(true);
  });
  it("is false otherwise and when there is no previous term", () => {
    expect(wonBestMemberPreviousTerm("m-1", term({ bestMemberId: "m-2" }))).toBe(false);
    expect(wonBestMemberPreviousTerm("m-1", null)).toBe(false);
  });
});

describe("evaluateEligibility", () => {
  it("blocks accrual for past presidents", () => {
    const result = evaluateEligibility({
      memberId: "dir-1",
      isPastPresident: true,
      currentTerm: term(),
      previousTerm: null,
    });
    expect(result.canAccrue).toBe(false);
    expect(result.canCompete).toBe(false);
    expect(result.reasons).toContain("PastPresident");
  });

  it("lets a CEL member accrue but not compete", () => {
    const result = evaluateEligibility({
      memberId: "cel-1",
      isPastPresident: false,
      currentTerm: term(),
      previousTerm: null,
    });
    expect(result.canAccrue).toBe(true);
    expect(result.canCompete).toBe(false);
    expect(result.reasons).toContain("ExecutiveCommittee");
  });

  it("excludes the previous winner from competition", () => {
    const result = evaluateEligibility({
      memberId: "dir-1",
      isPastPresident: false,
      currentTerm: term(),
      previousTerm: term({ id: "t2025", year: 2025, bestMemberId: "dir-1" }),
    });
    expect(result.canCompete).toBe(false);
    expect(result.reasons).toContain("WonPreviousTerm");
  });

  it("lets an ordinary director accrue and compete", () => {
    const result = evaluateEligibility({
      memberId: "dir-1",
      isPastPresident: false,
      currentTerm: term(),
      previousTerm: term({ id: "t2025", year: 2025, bestMemberId: "someone-else" }),
    });
    expect(result.canAccrue).toBe(true);
    expect(result.canCompete).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});
