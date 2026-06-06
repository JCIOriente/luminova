import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member, MemberPoints, Term } from "@luminova/types";
import { rankAnnual, rankMonthly, monthsPresent } from "./leaderboard";

function member(id: string, name: string, extra: Partial<Member> = {}): Member {
  return {
    id,
    name,
    email: `${id}@x.bo`,
    role: "Miembro",
    joinDate: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
    birthdate: Timestamp.fromDate(new Date("1990-01-01T00:00:00Z")),
    status: "Activo",
    profilePicture: null,
    totalPoints: 0,
    active: true,
    deletedAt: null,
    ...extra,
  };
}
function mp(
  memberId: string,
  cumulative: number,
  byMonth: Record<string, number> = {},
): MemberPoints {
  return {
    id: `${memberId}__2026`,
    memberId,
    termId: "2026",
    cumulative,
    byMonth,
    updatedAt: Timestamp.fromDate(new Date("2026-06-06T00:00:00Z")),
  };
}
function term(over: Partial<Term> = {}): Term {
  return {
    id: "2026",
    board: [],
    conventionDate: null,
    pointsCutoffAt: null,
    bestMemberId: null,
    status: "Activo",
    ...over,
  };
}

const membersById = new Map([
  ["a", member("a", "Ana")],
  ["b", member("b", "Bruno")],
  ["c", member("c", "Carla")],
]);

describe("rankAnnual", () => {
  it("ranks by cumulative desc with name tiebreak", () => {
    const out = rankAnnual({
      points: [mp("a", 10), mp("b", 30), mp("c", 30)],
      membersById,
      currentTerm: term(),
      previousTerm: null,
    });
    expect(out.map((e) => [e.rank, e.name, e.points])).toEqual([
      [1, "Bruno", 30],
      [2, "Carla", 30],
      [3, "Ana", 10],
    ]);
  });

  it("excludes CEL, past-president, previous winner, inactive, and zero/missing", () => {
    const m = new Map(membersById);
    m.set("p", member("p", "Pedro", { isPastPresident: true }));
    m.set("d", member("d", "Diego", { active: false }));
    const currentTerm = term({
      board: [{ memberId: "b", title: "Presidenta", isExecutiveCommittee: true }],
    });
    const previousTerm = term({ id: "2025", bestMemberId: "c" });
    const out = rankAnnual({
      points: [mp("a", 10), mp("b", 99), mp("c", 50), mp("p", 40), mp("d", 5), mp("x", 0)],
      membersById: m,
      currentTerm,
      previousTerm,
    });
    expect(out.map((e) => e.name)).toEqual(["Ana"]);
  });

  it("includes everyone with points when no term context is available", () => {
    const out = rankAnnual({
      points: [mp("a", 10), mp("b", 5)],
      membersById,
      currentTerm: null,
      previousTerm: null,
    });
    expect(out.map((e) => e.name)).toEqual(["Ana", "Bruno"]);
  });
});

describe("rankMonthly", () => {
  it("ranks by the month value and flags the best of month", () => {
    const out = rankMonthly(
      {
        points: [mp("a", 30, { "2026-06": 5 }), mp("b", 10, { "2026-06": 12 })],
        membersById,
        currentTerm: term(),
        previousTerm: null,
      },
      "2026-06",
    );
    expect(out.map((e) => [e.rank, e.name, e.points, e.isBestOfMonth])).toEqual([
      [1, "Bruno", 12, true],
      [2, "Ana", 5, false],
    ]);
  });

  it("excludes members with no points in the selected month", () => {
    const out = rankMonthly(
      {
        points: [mp("a", 30, { "2026-05": 9 }), mp("b", 10, { "2026-06": 12 })],
        membersById,
        currentTerm: term(),
        previousTerm: null,
      },
      "2026-06",
    );
    expect(out.map((e) => e.name)).toEqual(["Bruno"]);
  });
});

describe("monthsPresent", () => {
  it("unions byMonth keys newest first", () => {
    expect(
      monthsPresent([mp("a", 1, { "2026-05": 1, "2026-07": 2 }), mp("b", 1, { "2026-06": 3 })]),
    ).toEqual(["2026-07", "2026-06", "2026-05"]);
  });
});
