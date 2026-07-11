import { describe, expect, it } from "vitest";
import { CEL_POSITIONS } from "./cel-positions.js";
// The plain-Node seed scripts (tools/scripts) can't import this workspace package, so
// tools/scripts/lib/cel-seed.mjs hand-mirrors CEL_POSITIONS as plain data. This package
// OWNS the canonical CEL catalog, so it owns the proof its downstream mirror matches — a
// real cross-check, not a hardcoded snapshot. If cel-positions.ts changes (new cargo,
// changed grants, renamed title) and the mirror isn't updated (or vice versa), this fails.
// Runs in the fast `checks` CI job (no emulator). Sibling of role-definition.mirror.test.ts.
import { CEL_SEED as MIRROR_SEED, toPositionDoc } from "../../../tools/scripts/lib/cel-seed.mjs";

describe("tools/scripts/lib/cel-seed.mjs mirror is in sync with canonical", () => {
  it("CEL_SEED matches the canonical CEL_POSITIONS exactly", () => {
    expect(MIRROR_SEED).toEqual(CEL_POSITIONS);
  });

  it("toPositionDoc adds the seed-only fields onto each canonical entry", () => {
    for (const entry of CEL_POSITIONS) {
      expect(toPositionDoc(entry)).toEqual({ ...entry, active: true, deletedAt: null });
    }
  });
});
