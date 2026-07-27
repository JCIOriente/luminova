import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSelfProfileLane } from "../../../tools/scripts/lib/rules-locked-fields.mjs";
import { selfProfileSchema, PROFESSION_MAX_LENGTH } from "./member-schema.js";
import { BOLIVIA_PHONE_LENGTH } from "./phone.js";
import {
  MEMBER_NAME_MAX_LENGTH,
  MEMBER_NAME_MIN_LENGTH,
  MEMBER_NAME_PATTERN,
} from "./member-name.js";

// firestore.rules cannot import this package, so its self-service lane hand-lists the
// fields a member may write on their own doc, and selfProfileValid() hand-writes the two
// shape bounds. This package owns the canonical schema, so it owns the proof they agree —
// "rules mirror code" (engineering-guardrails #2). Without it, a rules cap stricter than
// the zod one surfaces to the member as a generic "no se pudo guardar", with nothing
// failing in CI. Runs in the fast `checks` job (no emulator).

const LANE = parseSelfProfileLane(
  readFileSync(fileURLToPath(new URL("../../../firestore.rules", import.meta.url)), "utf8"),
);

describe("firestore.rules members self lane is in sync with selfProfileSchema", () => {
  it("writes exactly the schema's fields plus the photo", () => {
    // profilePicture is deliberately outside the schema — it is its own action
    // (setProfilePicture), not a form field — so the union, not naive equality.
    expect(new Set(LANE.fields)).toEqual(
      new Set([...Object.keys(selfProfileSchema.shape), "profilePicture"]),
    );
  });

  it("bounds profession at the same length the schema does", () => {
    expect(LANE.professionMax).toBe(PROFESSION_MAX_LENGTH);
  });

  it("bounds the phone at the same digit count the schema does", () => {
    expect(LANE.phoneDigits).toBe(BOLIVIA_PHONE_LENGTH);
  });

  it("bounds the name at the same lengths the schema does", () => {
    expect(LANE.nameMin).toBe(MEMBER_NAME_MIN_LENGTH);
    expect(LANE.nameMax).toBe(MEMBER_NAME_MAX_LENGTH);
  });

  // Character-for-character, not "equivalent": a rules pattern that accepts one glyph the
  // form rejects (or vice versa) is a save that dies as a generic "no se pudo guardar".
  it("matches the name against the byte-identical pattern the schema does", () => {
    expect(LANE.namePattern).toBe(MEMBER_NAME_PATTERN);
  });
});
