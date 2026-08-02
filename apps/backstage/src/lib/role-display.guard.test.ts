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

/** 3, not all 7: the map that caused the bug listed exactly the five roles the old /permisos
 *  rendered (ROLES minus Member/Scanner), so an all-keys predicate would have missed it. */
const MIN_ROLE_ENTRIES = 3;

/** Escape hatch for a legitimate future per-role config (an icon map, a nav-target map).
 *  Must sit within OPT_OUT_REACH lines above the object literal's opening brace. */
const OPT_OUT = "role-labels-guard: allow";
const OPT_OUT_REACH = 3;

/** Matches `Admin: "` and `"Admin": "` — a role key bound to a string literal. Quoted keys
 *  were a hole in the previous `^\s*Admin:` predicate. */
const ROLE_ENTRY = new RegExp(`^(["']?)(?:${ROLES.join("|")})\\1\\s*:\\s*(?=["'\`])`);
const ENTRY_MAX_LEN = Math.max(...ROLES.map((role) => role.length)) + 16;

/** An entry only counts directly after `{` or `,`, which is where an object-literal key
 *  lives. Without it `cond ? "Admin" : "Miembro"` would read as a quoted role entry. */
function afterEntryBoundary(text: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && /\s/.test(text.charAt(j))) j--;
  return j >= 0 && (text.charAt(j) === "{" || text.charAt(j) === ",");
}

/** Highest number of role-keyed string entries found inside any single object literal.
 *
 *  Deliberately structural rather than textual: matching the Spanish text alone would have
 *  missed permission-labels.ts, whose labels had already drifted off the canonical ones —
 *  that drift WAS the bug. Braces are tracked with a small scanner that skips comments and
 *  string/template literals so JSX and class strings do not unbalance the depth. */
function maxRoleEntriesPerObject(text: string): number {
  const lines = text.split("\n");
  const optedOut = (line: number) =>
    lines.slice(Math.max(0, line - 1 - OPT_OUT_REACH), line).some((l) => l.includes(OPT_OUT));

  const open: { count: number; line: number }[] = [];
  let worst = 0;
  let line = 1;
  let i = 0;

  const skipString = (quote: string) => {
    i++;
    while (i < text.length && text[i] !== quote) {
      if (text[i] === "\\") i++;
      else if (text[i] === "\n") line++;
      i++;
    }
    i++;
  };

  while (i < text.length) {
    const ch = text[i];
    if (ch === "\n") {
      line++;
      i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    // Before the string branch: a quoted key ("Admin":) would otherwise be eaten as a literal.
    const innermost = open[open.length - 1];
    if (innermost && afterEntryBoundary(text, i)) {
      const match = text.slice(i, i + ENTRY_MAX_LEN).match(ROLE_ENTRY);
      if (match) {
        innermost.count++;
        i += match[0].length;
        continue;
      }
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      skipString(ch);
    } else if (ch === "{") {
      open.push({ count: 0, line });
      i++;
    } else if (ch === "}") {
      const block = open.pop();
      if (block && !optedOut(block.line)) worst = Math.max(worst, block.count);
      i++;
    } else {
      i++;
    }
  }
  return worst;
}

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

  it("no module declares an object literal keying several roles to strings", () => {
    const offenders = files
      .filter(({ text }) => maxRoleEntriesPerObject(text) >= MIN_ROLE_ENTRIES)
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

// A guard is only worth what it detects. These replay the predicate against the shapes the
// old all-keys version let through, so its real reach is asserted rather than assumed — and
// the two "does NOT catch" cases keep the documented limits honest.
describe("maxRoleEntriesPerObject", () => {
  it("flags a reconstruction of the deleted permission-labels.ts", () => {
    const reconstructed = `
      import type { Role } from "@luminova/types";
      export const PERMISSION_ROLE_INFO: Partial<Record<Role, string>> = {
        Admin: "Administrador",
        Membership: "Membresía",
        Treasury: "Tesorería",
        ExecutiveCommittee: "Comité Ejecutivo",
        ProjectManager: "Proyectos",
      };`;
    expect(maxRoleEntriesPerObject(reconstructed)).toBe(5);
  });

  it("flags a partial map of only three roles", () => {
    const partial = `const m = { Admin: "A", Treasury: "T", Scanner: "S" };`;
    expect(maxRoleEntriesPerObject(partial)).toBe(3);
  });

  it("flags quoted keys", () => {
    const quoted = `const m = { "Admin": "A", "Treasury": "T", "Scanner": "S" };`;
    expect(maxRoleEntriesPerObject(quoted)).toBe(3);
  });

  it("does not merge counts across sibling object literals", () => {
    const siblings = `const a = { Admin: "A", Treasury: "T" };\nconst b = { Scanner: "S", Member: "M" };`;
    expect(maxRoleEntriesPerObject(siblings)).toBe(2);
  });

  it("ignores role keys bound to something other than a string", () => {
    const perms = `const m = { Admin: ["manage:all"], Treasury: [], Scanner: [], Member: [] };`;
    expect(maxRoleEntriesPerObject(perms)).toBe(0);
  });

  it("ignores an identifier that merely ends in a role name", () => {
    const lookalike = `const m = { SubAdmin: "A", CoTreasury: "T", ViceScanner: "S" };`;
    expect(maxRoleEntriesPerObject(lookalike)).toBe(0);
  });

  it("honours the opt-out marker on the lines above the literal", () => {
    const allowed = `// role-labels-guard: allow — per-role icons, not labels\nconst m = { Admin: "shield", Treasury: "coin", Scanner: "qr" };`;
    expect(maxRoleEntriesPerObject(allowed)).toBe(0);
  });

  it("does not let a marker far above the literal opt a map out", () => {
    const stale = `// role-labels-guard: allow${"\n".repeat(OPT_OUT_REACH + 2)}const m = { Admin: "A", Treasury: "T", Scanner: "S" };`;
    expect(stale.includes(OPT_OUT)).toBe(true);
    expect(maxRoleEntriesPerObject(stale)).toBe(3);
  });

  it("is not confused by braces inside strings, comments or JSX", () => {
    const noisy = `
      const label = "a { brace";
      // { Admin: "A", Treasury: "T", Scanner: "S" }
      export function C() {
        return <div className={cn("x")}>{"{"}</div>;
      }`;
    expect(maxRoleEntriesPerObject(noisy)).toBe(0);
  });

  it("does NOT catch a switch returning labels (documented limit)", () => {
    const sw = `function label(role: Role) { switch (role) { case "Admin": return "Administrador"; default: return ""; } }`;
    expect(maxRoleEntriesPerObject(sw)).toBe(0);
  });

  it("does NOT catch an array of tuples (documented limit)", () => {
    const tuples = `const m = [["Admin", "Administrador"], ["Treasury", "Tesorería"]];`;
    expect(maxRoleEntriesPerObject(tuples)).toBe(0);
  });
});
