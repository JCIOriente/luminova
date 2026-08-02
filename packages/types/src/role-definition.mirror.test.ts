import { describe, expect, it } from "vitest";
import { BUILT_IN_ROLE_PERMS, ROLE_DESCRIPTIONS, ROLE_LABELS } from "./role-definition.js";
// The plain-Node seed scripts (tools/scripts) can't import this workspace package, so they
// hand-mirror BUILT_IN_ROLE_PERMS + ROLE_LABELS in role-seed.mjs. This package OWNS the
// canonical table, so it owns the proof its downstream mirror matches — a real cross-check,
// not a hardcoded snapshot. If role-definition.ts changes and the mirror isn't updated (or
// vice versa), this fails. Runs in the fast `checks` CI job (no emulator).
import {
  BUILT_IN_ROLE_PERMS as MIRROR_PERMS,
  ROLE_DESCRIPTIONS as MIRROR_DESCRIPTIONS,
  ROLE_LABELS as MIRROR_LABELS,
  permsForRoles,
} from "../../../tools/scripts/lib/role-seed.mjs";

describe("tools/scripts/lib/role-seed.mjs mirror is in sync with canonical", () => {
  it("BUILT_IN_ROLE_PERMS matches the canonical table exactly", () => {
    expect(MIRROR_PERMS).toEqual(BUILT_IN_ROLE_PERMS);
  });

  it("ROLE_LABELS matches the canonical labels exactly", () => {
    expect(MIRROR_LABELS).toEqual(ROLE_LABELS);
  });

  it("ROLE_DESCRIPTIONS matches the canonical descriptions exactly", () => {
    // Key coverage first: a missing export imports as `undefined`, and
    // expect(undefined).toEqual(undefined) would pass tautologically.
    expect(Object.keys(ROLE_DESCRIPTIONS)).toEqual(Object.keys(BUILT_IN_ROLE_PERMS));
    expect(MIRROR_DESCRIPTIONS).toEqual(ROLE_DESCRIPTIONS);
  });

  it("permsForRoles resolves each built-in role to its canonical (deduped, sorted) perms", () => {
    for (const role of Object.keys(BUILT_IN_ROLE_PERMS) as (keyof typeof BUILT_IN_ROLE_PERMS)[]) {
      const expected = [...new Set(BUILT_IN_ROLE_PERMS[role])].sort();
      expect(permsForRoles([role])).toEqual(expected);
    }
  });
});
