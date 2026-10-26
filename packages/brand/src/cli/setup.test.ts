import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fail, ok, warn } from "./rows.ts";
import { parseParts, setupReport } from "./setup.ts";
import type { ToolRow } from "./tools.ts";

const tried = (row: ReturnType<typeof ok>): ToolRow => ({ ...row, part: "try" });
const live = (row: ReturnType<typeof ok>): ToolRow => ({ ...row, part: "live" });

describe("parseParts", () => {
  it("checks both parts by default, or the one --part names", () => {
    expect(parseParts([])).toEqual(["try", "live"]);
    expect(parseParts(["--part", "try"])).toEqual(["try"]);
    expect(parseParts(["--part=live"])).toEqual(["live"]);
  });

  it("refuses any other part", () => {
    expect(() => parseParts(["--part", "deploy"])).toThrow(/--part is "try" or "live"/);
    expect(() => parseParts(["--part"])).toThrow(/--part needs a value/);
  });
});

describe("setupReport", () => {
  it("prints a table per part and, when all pass, the next step", () => {
    const { text, failed } = setupReport(
      [tried(ok("node", "24.15.0")), live(ok("gh", "2.103.0"))],
      ["try", "live"],
    );
    expect(failed).toBe(0);
    expect(text).toBe(
      [
        "Part 1: try it on your computer",
        "CHECK  STATUS  FOUND",
        "node   ok      24.15.0",
        "",
        "Part 2: go live",
        "CHECK  STATUS  FOUND",
        "gh     ok      2.103.0",
        "",
        "Next:",
        "  1. try it with the example (docs/adopting.md step 1)",
        "       pnpm install && pnpm dev   # in the repo root",
        "  2. when your chapter is ready to go live: docs/adopting.md step 6",
      ].join("\n"),
    );
  });

  it("counts failures, not warnings, and lists each fix once", () => {
    const install = { run: "brew install gh", where: "shell" as const };
    const { text, failed } = setupReport(
      [
        tried(warn("pnpm", "11.4.0", [{ run: "corepack install" }])),
        live(fail("gh", "not installed", [install])),
        live(fail("gh again", "not installed", [install])),
      ],
      ["try", "live"],
    );
    expect(failed).toBe(2);
    expect(text).toMatch(
      /To fix:\n {2}- corepack install {3}# in the repo root\n {2}- brew install gh {3}# in your shell$/,
    );
    expect(text).not.toMatch(/Next:/);
  });

  it("names only the part asked, with that part's next step", () => {
    const { text } = setupReport([live(ok("gh", "2.103.0"))], ["live"]);
    expect(text).not.toMatch(/Part 1/);
    expect(text).toMatch(
      /Next:\n {2}when your chapter is ready to go live: docs\/adopting\.md step 6$/,
    );
  });
});

describe("setup.ts", () => {
  // S4: a fresh clone runs `pnpm brand:setup` before `pnpm install`.
  it("imports no npm package, directly or through its modules", () => {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      for (const [, specifier] of source.matchAll(
        /^(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?"([^"]+)"/gm,
      )) {
        if (!specifier) continue;
        if (specifier.startsWith(".")) visit(resolve(dirname(file), specifier));
        else expect(specifier, `${file} imports ${specifier}`).toMatch(/^node:/);
      }
    };
    visit(join(dirname(fileURLToPath(import.meta.url)), "setup.ts"));
    expect(seen.size).toBeGreaterThan(3);
  });
});
