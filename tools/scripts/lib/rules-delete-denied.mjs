// Parses the collections whose firestore.rules deny client delete unconditionally — an
// `allow delete: if false` (or a blanket `allow write: if false`, which subsumes delete)
// inside a `match /<collection>/...` block. The catch-all `match /{document=**}` default-deny
// is excluded (it is not a real collection). Shared by tests/firestore-rules/rules.test.ts so
// the delete-denial coverage set is DERIVED from the rules, never a hand-maintained mirror
// that could silently lag a rules change (same discipline as parseActivityLockedFields).

/**
 * @param {string} source firestore.rules contents
 * @returns {string[]} sorted collection names whose client delete is a flat deny
 */
export function parseDeleteDeniedCollections(source) {
  const denied = new Set();
  let current = null;
  for (const line of source.split("\n")) {
    const matchLine = line.match(/^\s*match\s+\/(\S+)/);
    if (matchLine) {
      // Segment before the first `/`: "leads" from "leads/{leadId}", "{document=**}" from the
      // catch-all, "databases" from the documents root. Only a plain collection name counts.
      const name = matchLine[1].split("/")[0];
      current = /^[A-Za-z0-9_]+$/.test(name) && name !== "databases" ? name : null;
      continue;
    }
    if (current && /^\s*allow\s+[a-z, ]*\b(?:delete|write):\s*if\s+false\s*;/.test(line)) {
      denied.add(current);
    }
  }
  return [...denied].sort();
}
