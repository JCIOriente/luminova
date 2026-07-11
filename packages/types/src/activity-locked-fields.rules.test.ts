import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACTIVITY_LOCKED_FIELDS } from "./engine/activity.js";

// firestore.rules cannot import this workspace package, so its activityLockSafe() gate
// hand-lists the locked fields as unchanged('X') calls. This package OWNS the canonical
// ACTIVITY_LOCKED_FIELDS (from which the backstage client guard derives), so it owns the
// proof the rules match — the "rules mirror code" cross-check (engineering-guardrails #2).
// The live 4-vs-5 termId skew this replaces was invisible precisely because no test read
// both sides. Runs in the fast `checks` CI job (no emulator). Complements the deny-probe
// loop in tests/firestore-rules/rules.test.ts, which derives its probes from this same set.

const RULES_SOURCE = readFileSync(
  fileURLToPath(new URL("../../../firestore.rules", import.meta.url)),
  "utf8",
);

function rulesLockedFields(source: string): string[] {
  const fn = source.match(/function activityLockSafe\(\)[\s\S]*?\n\s{4}\}/);
  if (!fn) throw new Error("activityLockSafe() not found in firestore.rules");
  return [...fn[0].matchAll(/unchanged\('([^']+)'\)/g)].map((m) => m[1]);
}

describe("firestore.rules activityLockSafe() is in sync with canonical ACTIVITY_LOCKED_FIELDS", () => {
  it("locks exactly the canonical field set (order-independent)", () => {
    expect(new Set(rulesLockedFields(RULES_SOURCE))).toEqual(new Set(ACTIVITY_LOCKED_FIELDS));
  });
});
