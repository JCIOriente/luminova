import { describe, expect, it } from "vitest";
import { fail, formatReport, formatSections, ok, skip, warn } from "./rows.ts";

describe("formatSections", () => {
  it("prints each title over its rows, with columns aligned across every section", () => {
    const text = formatSections([
      { title: "Tools", rows: [ok("node", "24.15.0"), fail("firebase", "not installed")] },
      { title: "Going live", rows: [skip("bucket", "local-only profile")] },
    ]);
    expect(text).toBe(
      [
        "Tools",
        "  node      ok    24.15.0",
        "  firebase  fail  not installed",
        "",
        "Going live",
        "  bucket    skip  local-only profile",
      ].join("\n"),
    );
  });
});

describe("formatReport", () => {
  it("adds one To fix block under the sections and counts only failures", () => {
    const fix = { change: "install it", run: "brew install x", where: "shell" as const };
    const { text, failures } = formatReport([
      { title: "Tools", rows: [fail("x", "not installed", [fix]), warn("y", "old", [fix])] },
    ]);
    expect(failures).toBe(1);
    expect(text).toBe(
      [
        "Tools",
        "  x  fail  not installed",
        "  y  warn  old",
        "",
        "To fix:",
        "  - install it",
        "      brew install x   # in your shell",
      ].join("\n"),
    );
  });

  it("is only the sections when nothing needs fixing", () => {
    expect(formatReport([{ title: "Tools", rows: [ok("x", "1.0")] }])).toEqual({
      text: "Tools\n  x  ok  1.0",
      failures: 0,
    });
  });
});
