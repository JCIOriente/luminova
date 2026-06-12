import { describe, it, expect } from "vitest";
import type { Photo } from "@luminova/types";
import { removePhoto, moveCover, setCaption } from "./photo-array";

const ts = { toMillis: () => 0 } as Photo["uploadedAt"];
const make = (id: string): Photo => ({
  id,
  url: `u/${id}`,
  caption: null,
  uploadedAt: ts,
  uploadedBy: "m",
});

describe("photo-array transforms", () => {
  it("removes by id", () => {
    expect(removePhoto([make("a"), make("b")], "a").map((p) => p.id)).toEqual(["b"]);
  });
  it("moves the cover to index 0 preserving order of the rest", () => {
    expect(moveCover([make("a"), make("b"), make("c")], "c").map((p) => p.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
  it("is a no-op when the cover id is unknown", () => {
    expect(moveCover([make("a"), make("b")], "z").map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("sets a caption by id", () => {
    expect(setCaption([make("a")], "a", "Hola")[0]?.caption).toBe("Hola");
  });
});
