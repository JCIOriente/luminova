const WHITESPACE = /\s+/;

/** First letter of the first two whitespace-separated words, uppercased.
 *  Falls back to "?" for an empty/blank value. */
export function initials(value: string): string {
  const parts = value.trim().split(WHITESPACE);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
