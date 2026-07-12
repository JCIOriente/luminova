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
