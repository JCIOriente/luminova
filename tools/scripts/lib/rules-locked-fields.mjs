// Parses the field names firestore.rules' activityLockSafe() gate marks unchanged().
// Shared by the two cross-checks that must read the SAME set — the canonical drift
// guard (packages/types/src/activity-locked-fields.rules.test.ts) and the emulator
// deny-probe loop (tests/firestore-rules/rules.test.ts) — so a rules format change
// cannot silently split the two parsers.

/**
 * @param {string} source
 * @returns {string[]}
 */
export function parseActivityLockedFields(source) {
  const fn = source.match(/function activityLockSafe\(\)[\s\S]*?\n\s{4}\}/);
  if (!fn) throw new Error("activityLockSafe() not found in firestore.rules");
  return [...fn[0].matchAll(/unchanged\('([^']+)'\)/g)].map((m) => m[1]);
}

/** The members self-service lane: which fields a member may write on their own doc, plus
 *  the two shape bounds selfProfileValid() enforces. Mirrored by selfProfileSchema — see
 *  packages/types/src/member-self-lane.rules.test.ts.
 *
 * @param {string} source
 * @returns {{ fields: string[], professionMax: number, phoneDigits: number }}
 */
export function parseSelfProfileLane(source) {
  const guard = source.match(/function selfProfileValid\(changed\)[\s\S]*?\n\s{4}\}/);
  if (!guard) throw new Error("selfProfileValid() not found in firestore.rules");
  const list = guard[0].match(/hasOnly\(\[([^\]]+)\]\)/);
  const professionMax = guard[0].match(/profession[^\n]*size\(\) <= (\d+)/);
  const phoneDigits = guard[0].match(/matches\('\^\[0-9\]\{(\d+)\}\$'\)/);
  if (!list || !professionMax || !phoneDigits) {
    throw new Error("selfProfileValid() key set or bounds not found in firestore.rules");
  }

  return {
    fields: [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
    professionMax: Number(professionMax[1]),
    phoneDigits: Number(phoneDigits[1]),
  };
}
