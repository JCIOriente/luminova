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
 *  the shape bounds selfProfileValid() enforces. Mirrored by selfProfileSchema — see
 *  packages/types/src/member-self-lane.rules.test.ts.
 *
 *  The per-field probes are line-scoped (`[^\n]*`) on purpose, and that is what keeps them
 *  unambiguous — do not "simplify" them:
 *  - `profession` does not contain the substring `name` and vice versa, so the two
 *    `size() <=` probes cannot cross-match;
 *  - `[^\n]*` cannot cross a line boundary, so the `hasOnly([... 'name' ...])` line cannot
 *    satisfy the size/matches probes;
 *  - the name pattern is DOUBLE-quoted in the rules while the phone's is single-quoted,
 *    which is the only thing separating the two `matches()` probes.
 *  The pattern capture is greedy (`(.+)`, not `[^"]+`) so a future pattern containing a
 *  double quote is not silently truncated — the closing `"\)` anchors it.
 *
 * @param {string} source
 * @returns {{ fields: string[], professionMax: number, phoneDigits: number, nameMin: number, nameMax: number, namePattern: string }}
 */
export function parseSelfProfileLane(source) {
  const guard = source.match(/function selfProfileValid\(changed\)[\s\S]*?\n\s{4}\}/);
  if (!guard) throw new Error("selfProfileValid() not found in firestore.rules");
  const list = guard[0].match(/hasOnly\(\[([^\]]+)\]\)/);
  const professionMax = guard[0].match(/profession[^\n]*size\(\) <= (\d+)/);
  const phoneDigits = guard[0].match(/matches\('\^\[0-9\]\{(\d+)\}\$'\)/);
  const nameMin = guard[0].match(/name[^\n]*size\(\) >= (\d+)/);
  const nameMax = guard[0].match(/name[^\n]*size\(\) <= (\d+)/);
  const namePattern = guard[0].match(/name[^\n]*matches\("(.+)"\)/);
  if (!list || !professionMax || !phoneDigits || !nameMin || !nameMax || !namePattern) {
    throw new Error("selfProfileValid() key set or bounds not found in firestore.rules");
  }

  return {
    fields: [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
    professionMax: Number(professionMax[1]),
    phoneDigits: Number(phoneDigits[1]),
    nameMin: Number(nameMin[1]),
    nameMax: Number(nameMax[1]),
    namePattern: namePattern[1],
  };
}
