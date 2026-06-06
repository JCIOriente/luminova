const PREFIX = "jcioriente:member:";

/** Encode a member doc id as a scannable, namespaced QR payload (no PII). */
export function encodeMemberQr(memberId: string): string {
  return `${PREFIX}${memberId}`;
}

/** Parse a scanned QR string back to a member id, or null if it isn't ours /
 *  is malformed. Rejects path/composite separators to protect the check-in id. */
export function decodeMemberQr(text: string): string | null {
  if (!text.startsWith(PREFIX)) return null;
  const id = text.slice(PREFIX.length);
  if (id.length === 0 || id.includes("/") || id.includes("__")) return null;
  return id;
}
