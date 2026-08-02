import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROLES, ROLE_LABELS } from "@luminova/types";

// The bug this guards against already shipped once: features/positions/lib/permission-labels.ts
// hand-declared a second Spanish label map and three surfaces rendered it, so a role rename in
// /permisos changed one screen and not the others. roleDisplay() is now the only supported way
// to obtain a role's label, and this test keeps it that way.
const SRC = join(process.cwd(), "src");
const ALLOWED = join("lib", "role-display.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(path)) return [];
    if (/\.test\.tsx?$/.test(path)) return [];
    if (path.endsWith(ALLOWED)) return [];
    return [path];
  });
}

const files = sourceFiles(SRC).map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("role labels have exactly one source", () => {
  it("finds source files to check (guards against a broken walk)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no module other than lib/role-display.ts imports the seed label constants", () => {
    const offenders = files
      .filter(({ text }) => /\bROLE_LABELS\b|\bROLE_DESCRIPTIONS\b/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("no module declares a second table keyed by every built-in role", () => {
    // The structural signature of the shipped bug: an object literal listing all seven role
    // keys. Matching on the Spanish text alone would have missed permission-labels.ts, whose
    // labels had already drifted off the canonical ones — that drift WAS the bug.
    const offenders = files
      .filter(({ text }) => ROLES.every((role) => new RegExp(`^\\s*${role}:`, "m").test(text)))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("no module hardcodes a canonical multi-word role label", () => {
    // Multi-word only: single-word labels like "Miembro" legitimately appear in unrelated copy.
    // Matched as a complete quoted string literal, which is how a re-declared label map reads.
    // A bare substring match would flag prose like "Comité Ejecutivo Local" (the chapter body,
    // not the role) in member-form.tsx.
    const distinctive = Object.values(ROLE_LABELS).filter((label) => label.includes(" "));
    const offenders = files
      .filter(({ text }) =>
        distinctive.some((label) => text.includes(`"${label}"`) || text.includes(`'${label}'`)),
      )
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
