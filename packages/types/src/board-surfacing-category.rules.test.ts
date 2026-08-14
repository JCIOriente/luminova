import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BOARD_GROUPS, boardGroupFromCategory } from "./engine/board-public.js";

// firestore.rules cannot import this package, so boardSurfacingCategory() hand-writes the
// set of Position categories that reach the world-readable Directiva. This package owns the
// authority — BOARD_GROUPS / boardGroupFromCategory, which beacon's projectBoard actually
// consults — so it owns the proof the two agree ("rules mirror code", guardrail #2), the
// same job as role-name-bound.rules.test and member-self-lane.rules.test.
//
// What goes wrong without it: the two literals are the ONLY thing standing between a
// non-Admin create:Position holder and a self-minted board cargo. Add a third publishable
// group to BOARD_GROUPS — beacon starts publishing it — and the rules create arm still reads
// `in ['CEL','JDL']`, so minting one is a non-Admin write again. That is precisely the hole
// `boardSurfacingCategory()` was added to close, silently reopened, with nothing red.
// Runs in the fast `checks` job (no emulator).
//
// Parsed out of boardSurfacingCategory() specifically, not matched loose: 'CEL' and 'JDL'
// appear throughout the rules (the CEL conjunct in nonAdminAssignable(), comment prose), so
// a repo-wide search for the strings would pass on the wrong occurrence.

const RULES = readFileSync(
  fileURLToPath(new URL("../../../firestore.rules", import.meta.url)),
  "utf8",
);

function parseBoardSurfacingCategories(rules: string): string[] {
  const fn = rules.match(/function boardSurfacingCategory\(\)\s*\{[\s\S]*?\n {4}\}/)?.[0];
  if (fn === undefined) throw new Error("boardSurfacingCategory() not found in firestore.rules");
  const list = fn.match(/\bin\s*\[([^\]]*)\]/)?.[1];
  if (list === undefined) {
    throw new Error("boardSurfacingCategory() no longer tests membership of a [...] literal");
  }
  return list
    .split(",")
    .map((entry) => entry.trim().replace(/^'(.*)'$/, "$1"))
    .filter((entry) => entry.length > 0);
}

describe("firestore.rules boardSurfacingCategory is in sync with BOARD_GROUPS", () => {
  const categories = parseBoardSurfacingCategories(RULES);

  it("gates exactly the categories BOARD_GROUPS publishes", () => {
    expect(new Set(categories)).toEqual(new Set(BOARD_GROUPS));
  });

  // BOARD_GROUPS is the constant; boardGroupFromCategory is what projectBoard calls. Bind
  // the rules literal to the FUNCTION too, so a hand-written mapping that drifts from the
  // constant it is derived from cannot slip between them.
  it("names only categories boardGroupFromCategory actually publishes", () => {
    for (const category of categories) {
      expect(boardGroupFromCategory(category), category).not.toBeNull();
    }
  });

  it("omits no category boardGroupFromCategory publishes", () => {
    for (const group of BOARD_GROUPS) {
      expect(boardGroupFromCategory(group)).not.toBeNull();
      expect(categories, group).toContain(group);
    }
  });

  // The guard is only worth having if the non-board side stays non-board: `Comision` must
  // be absent from both, or the create arm goes Admin-only for the one category a non-Admin
  // is supposed to be able to mint.
  it("leaves Comision out of both", () => {
    expect(boardGroupFromCategory("Comision")).toBeNull();
    expect(categories).not.toContain("Comision");
  });
});
