import { describe, it, expect } from "vitest";
import { pageWindow } from "./page-window";

describe("pageWindow", () => {
  it("lists every page when total <= 7", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it("truncates with an ellipsis at the start", () => {
    expect(pageWindow(8, 10)).toEqual([1, "…", 6, 7, 8, 9, 10]);
  });
  it("truncates with an ellipsis at the end", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, 5, "…", 10]);
  });
  it("truncates both sides in the middle", () => {
    expect(pageWindow(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
  });
});
