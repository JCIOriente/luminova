/** The org-wide default for a brand-new member: publishable on the public Directiva,
 *  which the member can turn off at any time from /me. It lives server-side because the
 *  firestore.rules create arm rejects `publicProfile` from every client — a creator who
 *  could stamp it could publish a person who never consented. */
export const PUBLIC_PROFILE_DEFAULT = true;

/** Whether a freshly created member doc still needs the default stamped. Absent only:
 *  a doc that already carries the key (any value, including an explicit false) has been
 *  decided already and must never be overwritten. */
export function needsPublicProfileDefault(data: Record<string, unknown> | undefined): boolean {
  return data !== undefined && !("publicProfile" in data);
}
