/** Assemble the access link an operator shares by hand.
 *
 *  THE CLIENT builds this, not beacon: beacon has no configuration surface beyond
 *  `process.env.GCLOUD_PROJECT`, so a base URL there would mean a new functions env/param and
 *  a deploy-time owner-op — and it would be wrong in the emulator and in every preview.
 *
 *  ONE helper, not three, so the three operator surfaces cannot build three different URLs
 *  (guardrail #1).
 *
 *  A PURE STRING BUILDER with no `@luminova/firebase` import, deliberately. This module is
 *  shared, so a functions/SDK import here would be pulled into the eager shell — the failure
 *  mode `docs/performance.md` records. Keep it dependency-free.
 *
 *  THE TOKEN GOES IN THE FRAGMENT. Firebase Hosting access logs record path and query but
 *  never the fragment; nor does a Referer header, nor `document.referrer` for any third-party
 *  script. A query param or path segment would put a live bearer credential into a log sink
 *  with a long retention that nobody on this team controls. The fragment is still in browser
 *  history and readable by page JS — TTL, single use and revocation are the real mitigations;
 *  this removes the server-log and Referer copies and nothing more. */
export function inviteLink(token: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/invitacion#${token}`;
}
