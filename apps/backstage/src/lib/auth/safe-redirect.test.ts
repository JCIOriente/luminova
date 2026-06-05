import { describe, it, expect } from "vitest";
import { safeRedirect } from "./safe-redirect";

describe("safeRedirect", () => {
  it("accepts a same-origin relative path", () => {
    expect(safeRedirect("/members?page=2")).toBe("/members?page=2");
  });

  it("rejects an absolute http(s) URL", () => {
    expect(safeRedirect("https://evil.example/harvest")).toBeUndefined();
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeRedirect("//evil.example")).toBeUndefined();
  });

  it("rejects a non-string value", () => {
    expect(safeRedirect(undefined)).toBeUndefined();
    expect(safeRedirect(42)).toBeUndefined();
  });

  it("rejects a path that does not start with a slash", () => {
    expect(safeRedirect("members")).toBeUndefined();
    expect(safeRedirect("javascript:alert(1)")).toBeUndefined();
  });

  it("rejects a backslash-obfuscated protocol-relative URL", () => {
    expect(safeRedirect("/\\evil.example")).toBeUndefined();
  });
});
