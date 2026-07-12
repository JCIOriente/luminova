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

  it("toPositionDoc normalizes optional titleFemale/sigla to null, matching toPositionCreateDoc", () => {
    for (const entry of CEL_POSITIONS) {
      // Mirrors position-mapper.ts toPositionCreateDoc: Firestore rejects undefined, so the
      // optional fields must land as null — else seeded docs drift from app-created ones.
      expect(toPositionDoc(entry)).toEqual({
        ...entry,
        titleFemale: entry.titleFemale ?? null,
        sigla: entry.sigla ?? null,
        active: true,
        deletedAt: null,
      });
      expect(toPositionDoc(entry)).toHaveProperty("sigla", null);
    }
  });
});
