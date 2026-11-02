import { describe, expect, it } from "vitest";
import { fail, formatReport, formatSections, ok, skip, verdict, warn } from "./rows.ts";

describe("formatSections", () => {
  it("draws one table per section, the title heading the first column, columns aligned", () => {
    const text = formatSections(
      [
        { title: "Tools", rows: [ok("node", "24.15.0"), fail("firebase", "not installed")] },
        { title: "Going live", rows: [skip("bucket", "local-only profile")] },
      ],
      100,
    );
    expect(text).toBe(
      [
        "┌───────────────┬───────────┬────────────────────┐",
        "│ Tools         │ Status    │ Details            │",
        "├───────────────┼───────────┼────────────────────┤",
        "│ Node.js       │ ✓ OK      │ 24.15.0            │",
        "│ Firebase CLI  │ ✗ Problem │ not installed      │",
        "└───────────────┴───────────┴────────────────────┘",
        "",
        "┌───────────────┬───────────┬────────────────────┐",
        "│ Going live    │ Status    │ Details            │",
        "├───────────────┼───────────┼────────────────────┤",
        "│ Brand storage │ - Skipped │ local-only profile │",
        "└───────────────┴───────────┴────────────────────┘",
      ].join("\n"),
    );
  });

  it("never prints wider than the window, whatever the detail", () => {
    const text = formatSections(
      [{ title: "Tools", rows: [warn("pnpm", "word ".repeat(40).trim())] }],
      60,
    );
    for (const line of text.split("\n")) expect(line.length).toBeLessThanOrEqual(60);
  });

  it("shows an image row by its path", () => {
    expect(
      formatSections([{ title: "Images", rows: [ok("logo-main.png", "valid")] }], 100),
    ).toContain("logo-main.png");
  });
});

describe("formatReport", () => {
  it("adds one To fix block under the sections and counts only failures", () => {
    const fix = { change: "install it", run: "brew install x", where: "shell" as const };
    const { text, failures } = formatReport(
      [{ title: "Tools", rows: [fail("x", "not installed", [fix]), warn("y", "old", [fix])] }],
      100,
    );
    expect(failures).toBe(1);
    expect(text.split("\n").slice(-3)).toEqual([
      "To fix:",
      "  - install it",
      "      brew install x   # in your shell",
    ]);
  });

  it("does not call a note a problem to fix", () => {
    const { text, failures } = formatReport(
      [{ title: "Tools", rows: [warn("y", "old", [{ change: "update it" }])] }],
      100,
    );
    expect(failures).toBe(0);
    expect(text).toContain("Worth a look:\n  - update it");
    expect(text).not.toContain("To fix:");
  });

  it("is only the sections when nothing needs fixing", () => {
    const { text, failures } = formatReport([{ title: "Tools", rows: [ok("x", "1.0")] }], 100);
    expect(failures).toBe(0);
    expect(text).not.toMatch(/To fix|Worth a look/);
  });
});

describe("verdict", () => {
  const section = (...rows: Parameters<typeof verdict>[0][number]["rows"]) => [
    { title: "Tools", rows },
  ];

  it("counts the problems first", () => {
    expect(verdict(section(fail("a", "x"), fail("b", "x"), warn("c", "x")))).toBe(
      "✗ 2 problems to fix",
    );
  });

  it("counts the notes when nothing failed", () => {
    expect(verdict(section(ok("a", "x"), warn("b", "x")))).toBe(
      "✓ No problems, 1 note worth a look",
    );
  });

  it("says ready when every row passed or waits", () => {
    expect(verdict(section(ok("a", "x"), skip("b", "x")))).toBe("✓ Everything is ready");
  });
});
