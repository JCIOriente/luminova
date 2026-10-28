import { describe, expect, it } from "vitest";
import { fail, formatSections, ok, skip } from "./rows.ts";

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
