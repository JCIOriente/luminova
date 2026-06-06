import { describe, it, expect } from "vitest";
import { pointsRank } from "./points-rank";
import type { MemberPoints } from "@luminova/types/engine";

const pts = (id: string, cumulative: number) =>
  ({ id: `${id}__2026`, memberId: id, termId: "2026", cumulative, byMonth: {} }) as MemberPoints;

describe("pointsRank", () => {
  it("ranks by cumulative (1-based), counting only positive entries", () => {
    const all = [pts("a", 10), pts("b", 4), pts("c", 7), pts("d", 0)];
    expect(pointsRank(all, "a")).toEqual({ rank: 1, total: 3 });
    expect(pointsRank(all, "c")).toEqual({ rank: 2, total: 3 });
    expect(pointsRank(all, "b")).toEqual({ rank: 3, total: 3 });
  });
  it("returns null when the member has no positive entry", () => {
    expect(pointsRank([pts("a", 10)], "z")).toBeNull();
    expect(pointsRank([pts("a", 0)], "a")).toBeNull();
  });
});
