import { describe, expect, it } from "vitest";
import { encodePng, readPngSize } from "./png.ts";

describe("encodePng", () => {
  it("writes the PNG signature and an IHDR with the requested size", () => {
    const png = encodePng(3, 2, [0x33, 0x66, 0x99]);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
  });
});

describe("readPngSize", () => {
  it("reads width and height from IHDR", () => {
    expect(readPngSize(encodePng(674, 326, [0, 0, 0]))).toEqual({ width: 674, height: 326 });
  });

  it("returns null for a file without the PNG signature", () => {
    expect(readPngSize(Buffer.from("GIF89a not a png at all, padded"))).toBeNull();
  });

  it("returns null for a truncated PNG", () => {
    expect(readPngSize(encodePng(16, 16, [0, 0, 0]).subarray(0, 20))).toBeNull();
  });

  it("returns null when the first chunk is not IHDR", () => {
    const png = encodePng(16, 16, [0, 0, 0]);
    png.write("IDAT", 12, "latin1");
    expect(readPngSize(png)).toBeNull();
  });
});
