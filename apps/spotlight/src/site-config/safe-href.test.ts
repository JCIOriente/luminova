import { describe, expect, it } from "vitest";
import { safeHref } from "./safe-href";

describe("safeHref", () => {
  it("passes through https", () => {
    expect(safeHref("https://jci.cc")).toBe("https://jci.cc");
  });
  it("passes through mailto", () => {
    expect(safeHref("mailto:jci@example.com")).toBe("mailto:jci@example.com");
  });
  it("passes through the # placeholder", () => {
    expect(safeHref("#")).toBe("#");
  });
  it("neutralizes javascript: to #", () => {
    expect(safeHref("javascript:alert(1)")).toBe("#");
  });
  it("neutralizes empty/other schemes to #", () => {
    expect(safeHref("")).toBe("#");
    expect(safeHref("ftp://x")).toBe("#");
  });
});
