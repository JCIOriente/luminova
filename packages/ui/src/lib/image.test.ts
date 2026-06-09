import { describe, expect, it } from "vitest";
import { validateImage, fittedDimensions, IMAGE_MAX_BYTES } from "./image";

describe("validateImage", () => {
  it("accepts a jpeg under the size cap", () => {
    const file = new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" });
    expect(validateImage(file)).toEqual({ ok: true });
  });
  it("rejects non-images", () => {
    const file = new File([new Uint8Array(10)], "a.pdf", { type: "application/pdf" });
    expect(validateImage(file)).toEqual({ ok: false, reason: "type" });
  });
  it("rejects oversize files", () => {
    const big = new File([new Uint8Array(IMAGE_MAX_BYTES + 1)], "a.png", { type: "image/png" });
    expect(validateImage(big)).toEqual({ ok: false, reason: "size" });
  });
});

describe("fittedDimensions", () => {
  it("downscales the long edge to max, preserves aspect", () => {
    expect(fittedDimensions(1200, 600, 512)).toEqual({ width: 512, height: 256 });
  });
  it("does not upscale smaller images", () => {
    expect(fittedDimensions(300, 200, 512)).toEqual({ width: 300, height: 200 });
  });
  it("handles square", () => {
    expect(fittedDimensions(1024, 1024, 512)).toEqual({ width: 512, height: 512 });
  });
});
