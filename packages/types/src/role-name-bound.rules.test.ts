import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROLE_NAME_MAX_LENGTH, roleDefinitionSchema } from "./role-definition-schema.js";

// firestore.rules cannot import this package, so roleShapeValid() hand-writes the role
// name bound. This package owns the write schema, so it owns the proof the two agree —
// "rules mirror code" (engineering-guardrails #2), same job as member-self-lane.rules.test.
// Without it, a rules bound stricter than the zod one surfaces to the admin as a generic
// "No se pudo guardar", with nothing failing in CI — and for a role doc ALREADY over the
// bound (built-in renaming shipped with no upper bound), every client update to it is
// denied, deactivation included. Console-only recovery. Runs in the fast `checks` job.
//
// The bound is parsed out of roleShapeValid() specifically, not matched loose: the
// leads-create arm carries a byte-identical `name` triple, so a repo-wide search for
// `name.size() <=` would pass on the wrong number.

const RULES = readFileSync(
  fileURLToPath(new URL("../../../firestore.rules", import.meta.url)),
  "utf8",
);

function parseRoleNameBound(rules: string): { min: number; max: number } {
  const fn = rules.match(/function roleShapeValid\(\)\s*\{[\s\S]*?\n {4}\}/)?.[0];
  if (fn === undefined) throw new Error("roleShapeValid() not found in firestore.rules");
  const min = fn.match(/d\.name\.size\(\)\s*>=\s*(\d+)/)?.[1];
  const max = fn.match(/d\.name\.size\(\)\s*<=\s*(\d+)/)?.[1];
  if (min === undefined || max === undefined) {
    throw new Error("roleShapeValid() no longer bounds d.name.size() on both sides");
  }
  return { min: Number(min), max: Number(max) };
}

describe("firestore.rules roleShapeValid is in sync with roleDefinitionSchema", () => {
  const bound = parseRoleNameBound(RULES);

  it("bounds the role name at the same maximum the schema does", () => {
    expect(bound.max).toBe(ROLE_NAME_MAX_LENGTH);
  });

  // The rules floor is `>= 1`; the schema's is `.min(1)`. Asserted so a rules-side
  // tightening to, say, 3 cannot land while the form still accepts a 1-char name.
  it("bounds the role name at the same minimum the schema does", () => {
    const shortest = "n".repeat(bound.min);
    expect(
      roleDefinitionSchema.safeParse({ name: shortest, description: "", permissions: [] }).success,
    ).toBe(true);
    expect(
      roleDefinitionSchema.safeParse({
        name: "n".repeat(bound.min - 1),
        description: "",
        permissions: [],
      }).success,
    ).toBe(false);
  });
});
