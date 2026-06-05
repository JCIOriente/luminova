/**
 * Sanitizes a post-login redirect target. Only same-origin relative paths are
 * allowed — anything that could navigate off-origin (absolute URLs,
 * protocol-relative `//host`, backslash-obfuscated `/\host`, or non-paths) is
 * rejected to prevent open redirects.
 */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/")) return undefined;
  if (value.startsWith("//") || value.startsWith("/\\")) return undefined;
  return value;
}
