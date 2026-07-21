// Single definition of "the collection name a `match /<X>/…` line declares", shared by every
// firestore.rules scraper (the orphan guard in rules-coverage.test.ts and the delete-denied
// parser in rules-delete-denied.mjs) so they can never drift on what counts as a collection id.
// Charset = every legal Firestore collection-id character (letters, digits, `_`, `-`), so a
// future `match /point-rules/{id}` is seen by both. The `match /{document=**}` wildcards start
// with `{` and yield null; the documents root `match /databases/{database}/documents` yields
// "databases" (callers exclude it as structural).

/**
 * @param {string} line a single line of firestore.rules
 * @returns {string | null} the collection name this line declares, or null if it is not a
 *   `match /<name>/…` line (blank line, allow-arm, function, or a `{…}` wildcard match)
 */
export function collectionNameFromMatchLine(line) {
  const m = line.match(/^\s*match\s+\/([A-Za-z][A-Za-z0-9_-]*)/);
  return m ? m[1] : null;
}
