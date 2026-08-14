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
// The same job is done a second time for nonAdminAssignable(), the OTHER hand-written
// literal over these categories — and it is the one that defaults to ALLOW. It encodes the
// assignment boundary as a denylist of one (`category != 'CEL'`), so a third publishable
// group added to BOARD_GROUPS would be forced into boardSurfacingCategory() by the
// assertions above — minting it goes Admin-only, good — while nonAdminAssignable() silently
// kept ASSIGNING it open to every non-Admin. A new board group would auto-enroll into the
// accepted-exposure class (spec A: "the ceiling is JDL") with nobody deciding. Same
// silent-reopen shape, one function over.
//
// Parsed out of each function specifically, not matched loose: 'CEL' and 'JDL' appear
// throughout the rules (comment prose, the positions arms), so a repo-wide search for the
// strings would pass on the wrong occurrence.

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

/** The categories nonAdminAssignable() names in a `category ... != '<X>'` conjunct — the
 *  denylist that decides which board cargos a non-Admin may assign through the members
 *  lanes. */
function parseNonAdminAssignableDenials(rules: string): string[] {
  const fn = rules.match(/function nonAdminAssignable\(cargo\)\s*\{[\s\S]*?\n {4}\}/)?.[0];
  if (fn === undefined) throw new Error("nonAdminAssignable() not found in firestore.rules");
  const denials = [...fn.matchAll(/!=\s*'([^']*)'/g)].map((match) => match[1]);
  if (denials.length === 0) {
    throw new Error("nonAdminAssignable() no longer excludes any category by name");
  }
  return denials;
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

  // The ALLOW-by-default twin. Everything above binds the Admin-only MINT boundary; this
  // binds the non-Admin ASSIGN boundary to the same constant, so a new board group cannot
  // enroll itself into the accepted public exposure.
  describe("nonAdminAssignable's exclusions cover every board group but JDL", () => {
    const denied = new Set(parseNonAdminAssignableDenials(RULES));

    it("leaves exactly JDL assignable by a non-Admin", () => {
      // Not `expect(denied).toEqual(new Set(['CEL']))`: the assertion that must go red on a
      // new BOARD_GROUPS entry is about the categories left OPEN, and it is derived from the
      // constant. Adding 'XYZ' to BOARD_GROUPS makes this ['JDL','XYZ'] until somebody
      // either excludes it here or decides, in writing, that it is publishable by delegates.
      expect(BOARD_GROUPS.filter((group) => !denied.has(group))).toEqual(["JDL"]);
    });

    it("excludes only categories that actually reach the public Directiva", () => {
      // The other direction: an exclusion naming a non-board category would be dead weight
      // gating nothing (and would wrongly narrow the comisión lane if it named 'Comision').
      for (const category of denied) {
        expect(boardGroupFromCategory(category), category).not.toBeNull();
      }
    });
  });
});
