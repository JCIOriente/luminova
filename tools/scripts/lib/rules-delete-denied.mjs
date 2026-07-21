// Parses the collections whose firestore.rules deny client delete unconditionally — an
// `allow delete: if false` (or a blanket `allow write: if false`, which subsumes delete)
// inside a `match /<collection>/...` block. The catch-all `match /{document=**}` default-deny
// and the `databases` documents root are excluded (neither is a real collection). Shared by
// tests/firestore-rules/rules.test.ts so the delete-denial coverage set is DERIVED from the
// rules, never a hand-maintained mirror that could silently lag a rules change (same
// discipline as parseActivityLockedFields). Collection-name extraction is delegated to the
// shared collectionNameFromMatchLine so this and the orphan guard can't drift on the charset.
import { collectionNameFromMatchLine } from "./rules-collections.mjs";

/**
 * @param {string} source firestore.rules contents
 * @returns {string[]} sorted collection names whose client delete is a flat deny
 */
export function parseDeleteDeniedCollections(source) {
  const denied = new Set();
  let current = null;
  for (const line of source.split("\n")) {
    if (/^\s*match\b/.test(line)) {
      const name = collectionNameFromMatchLine(line);
      current = name && name !== "databases" ? name : null;
      continue;
    }
    if (current && /^\s*allow\s+[a-z, ]*\b(?:delete|write):\s*if\s+false\s*;/.test(line)) {
      denied.add(current);
    }
  }
  return [...denied].sort();
}
