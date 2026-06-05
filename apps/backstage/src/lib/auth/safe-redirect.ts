/**
 * Sanitizes a post-login redirect target. Only same-origin relative paths are
 * allowed — anything that could navigate off-origin (absolute URLs,
 * protocol-relative `//host`, backslash-obfuscated `/\host`, or non-paths) is
 * rejected to prevent open redirects.
 */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/")) return undefined;
  // Browsers strip tab/CR/LF when parsing URLs, so "/\t/host" collapses to
  // "//host" (protocol-relative, off-origin). Reject any control char up front.
  if (hasControlChar(value)) return undefined;
  if (value.startsWith("//") || value.startsWith("/\\")) return undefined;
  return value;
}
