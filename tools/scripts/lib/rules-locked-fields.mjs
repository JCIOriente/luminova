// Parses the field names firestore.rules' activityLockSafe() gate marks unchanged().
// Shared by the two cross-checks that must read the SAME set — the canonical drift
// guard (packages/types/src/activity-locked-fields.rules.test.ts) and the emulator
// deny-probe loop (tests/firestore-rules/rules.test.ts) — so a rules format change
// cannot silently split the two parsers.

/**
 * Extract one rules-function body by name. The `\n\s{4}\}` terminator encodes the file's
 * 4-space top-level function indentation — a single shared assumption rather than one per
 * parser, so a reformat breaks (loudly) in one place instead of three.
 *
 * @param {string} source
 * @param {string} signature exact `name(params)` as written in firestore.rules
 * @returns {string}
 */
function ruleFunctionBody(source, signature) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fn = source.match(new RegExp(`function ${escaped}[\\s\\S]*?\\n\\s{4}\\}`));
  if (!fn) throw new Error(`${signature} not found in firestore.rules`);
  return fn[0];
}

/**
 * @param {string} source
 * @returns {string[]}
 */
export function parseActivityLockedFields(source) {
  const fn = ruleFunctionBody(source, "activityLockSafe()");
  return [...fn.matchAll(/unchanged\('([^']+)'\)/g)].map((m) => m[1]);
}

/** The members name gate, mirrored by memberName — see
 *  packages/types/src/member-self-lane.rules.test.ts.
 *
 *  Scoping the probes to memberNameValid()'s body is what makes them unambiguous: `name` is
 *  the function's only parameter there, so a bare `name.size()` cannot collide with another
 *  field's bound the way it would inside selfProfileValid() (where `profession` also
 *  carries a `size() <=`). Do not move these probes back into the lane function.
 *  The pattern capture is greedy (`(.+)`, not `[^"]+`) so a future pattern containing a
 *  double quote is not silently truncated — the closing `"\)` anchors it.
 *
 * @param {string} source
 * @returns {{ min: number, max: number, pattern: string }}
 */
export function parseMemberNameGate(source) {
  const fn = ruleFunctionBody(source, "memberNameValid(name)");
  const min = fn.match(/name\.size\(\) >= (\d+)/);
  const max = fn.match(/name\.size\(\) <= (\d+)/);
  const pattern = fn.match(/name\.matches\("(.+)"\)/);
  if (!min || !max || !pattern) {
    throw new Error("memberNameValid() bounds not found in firestore.rules");
  }
  return { min: Number(min[1]), max: Number(max[1]), pattern: pattern[1] };
}

/** The members self-service lane: which fields a member may write on their own doc, plus
 *  the shape bounds selfProfileValid() enforces. Mirrored by selfProfileSchema — see
 *  packages/types/src/member-self-lane.rules.test.ts. The name's bounds are NOT here —
 *  they live in memberNameValid(), see parseMemberNameGate above.
 *
 *  The profession probe is line-scoped (`[^\n]*`) on purpose: `[^\n]*` cannot cross a line
 *  boundary, so the `hasOnly([...])` key list cannot satisfy it.
 *
 * @param {string} source
 * @returns {{ fields: string[], professionMax: number, phoneDigits: number }}
 */
export function parseSelfProfileLane(source) {
  const guard = ruleFunctionBody(source, "selfProfileValid(changed)");
  const list = guard.match(/hasOnly\(\[([^\]]+)\]\)/);
  const professionMax = guard.match(/profession[^\n]*size\(\) <= (\d+)/);
  const phoneDigits = guard.match(/matches\('\^\[0-9\]\{(\d+)\}\$'\)/);
  if (!list || !professionMax || !phoneDigits) {
    throw new Error("selfProfileValid() key set or bounds not found in firestore.rules");
  }

  return {
    fields: [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
    professionMax: Number(professionMax[1]),
    phoneDigits: Number(phoneDigits[1]),
  };
}
