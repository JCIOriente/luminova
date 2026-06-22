// The public site reads Firestore directly, so admin-authored hrefs are
// re-checked at render time, independent of the backstage Zod schema.
export function safeHref(url: string): string {
  return url === "#" || /^(https?:\/\/|mailto:)/i.test(url) ? url : "#";
}
