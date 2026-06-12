import { describe, it, expect } from "vitest";
import type { Activity, Photo } from "@luminova/types";
import { groupActivityPhotos } from "./gallery";

const at = (ms: number) => ({ toMillis: () => ms }) as Activity["startAt"];
const photo = (id: string): Photo =>
  ({ id, url: `u/${id}`, caption: null, uploadedAt: at(0), uploadedBy: "m" }) as Photo;
const act = (id: string, startMs: number, photos: Photo[]): Activity =>
  ({ id, title: `A-${id}`, startAt: at(startMs), photos }) as unknown as Activity;

describe("groupActivityPhotos", () => {
  it("keeps only activities that have photos, oldest-start first", () => {
    const groups = groupActivityPhotos([
      act("b", 200, [photo("p2")]),
      act("a", 100, [photo("p1")]),
      act("c", 300, []),
    ]);
    expect(groups.map((g) => g.activityId)).toEqual(["a", "b"]);
    expect(groups[0]?.title).toBe("A-a");
    expect(groups[0]?.photos.map((p) => p.id)).toEqual(["p1"]);
  });
  it("returns [] when nothing has photos", () => {
    expect(groupActivityPhotos([act("a", 1, [])])).toEqual([]);
  });
});
