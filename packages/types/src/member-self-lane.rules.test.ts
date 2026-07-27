import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseSelfProfileLane,
  parseMemberNameGate,
} from "../../../tools/scripts/lib/rules-locked-fields.mjs";
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

const RULES = readFileSync(
  fileURLToPath(new URL("../../../firestore.rules", import.meta.url)),
  "utf8",
);
const LANE = parseSelfProfileLane(RULES);
const NAME_GATE = parseMemberNameGate(RULES);

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
    expect(NAME_GATE.min).toBe(MEMBER_NAME_MIN_LENGTH);
    expect(NAME_GATE.max).toBe(MEMBER_NAME_MAX_LENGTH);
  });

  // Character-for-character, not "equivalent": a rules pattern that accepts one glyph the
  // form rejects (or vice versa) is a save that dies as a generic "no se pudo guardar".
  it("matches the name against the byte-identical pattern the schema does", () => {
    expect(NAME_GATE.pattern).toBe(MEMBER_NAME_PATTERN);
  });

  // The gate is only worth having if every writer passes through it. A lane that writes
  // members.name without calling memberNameValid() leaves the CSV/boardShowcase invariant
  // resting on client-side zod, which a direct authenticated write bypasses.
  it("binds the name gate on every members write lane, not just the self lane", () => {
    const block = RULES.match(/match \/members\/\{memberId\}[\s\S]*?\n {4}\}/);
    expect(block).not.toBeNull();
    // Strip comment lines first: split() attaches each arm's LEADING comment block to the
    // PREVIOUS arm, so a comment mentioning memberNameValid( above an arm would otherwise
    // satisfy the assertion for the arm before it.
    const body = (block?.[0] ?? "").replace(/^\s*\/\/.*$/gm, "");
    const arms = body.split(/allow (?=create|update)/).slice(1);
    // >= the 4 that exist today (create, institutional update, self update, EC
    // positions-only), so the split under-matching cannot make the loop vacuous. Not an
    // equality: a new arm is a thing to gate, not a test failure.
    expect(arms.length).toBeGreaterThanOrEqual(4);
    for (const arm of arms) {
      const writesName = !arm.includes("hasOnly(['positions'])");
      if (writesName) {
        expect(arm).toMatch(/memberNameValid\(|selfProfileValid\(/);
      }
    }
  });

  // The self arm satisfies the assertion above via selfProfileValid( alone, so without this
  // the fast job would stay green if the name check were dropped from inside that function —
  // only the emulator suite would catch it.
  it("gates the name inside selfProfileValid, not just at the arm", () => {
    expect(RULES).toMatch(/function selfProfileValid[\s\S]*?memberNameValid\([\s\S]*?\n {4}\}/);
  });
});
