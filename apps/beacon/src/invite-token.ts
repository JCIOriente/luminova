import { createHash, randomBytes } from "node:crypto";

/** The invite token: 256 bits of CSPRNG output, and the SHA-256 that keys its document.
 *
 *  Node core only — no new dependency, nothing to vet.
 *
 *  WHY A FAST HASH IS CORRECT HERE. bcrypt/scrypt/argon2 exist to slow offline brute force
 *  against LOW-ENTROPY human-chosen secrets. The input is 256 bits of CSPRNG output; there is
 *  nothing to brute force (a guess resolves to a nonexistent document id — one read, no write,
 *  no side channel). A KDF would mean a new dependency for zero security gain.
 *
 *  THE HASH IS THE DOCUMENT ID, which is why there is no secret comparison anywhere in this
 *  codebase: a wrong token derives a different key and resolves to nothing, so the
 *  timing-safe-comparison question dissolves. `createHash` over a fixed-length input is
 *  constant work. A keyed get() is also bounded by construction (guardrail #5), needs no
 *  index, and cannot be enumerated. */

/** 32 bytes -> 43 base64url characters. Total link length lands near 70 characters: one line
 *  in a WhatsApp message, no preview truncation. */
const TOKEN_BYTES = 32;

export interface MintedInviteToken {
  /** The bearer credential. Returned to the operator ONCE and never stored. */
  token: string;
  /** What is actually persisted, as the document id. */
  tokenHash: string;
}

export function mintInviteToken(): MintedInviteToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Whether a value is the exact shape `hashInviteToken` produces, and therefore safe to
 *  interpolate into `memberInvites/${hash}`.
 *
 *  Tighter than `isSafeDocId` on purpose: the input is attacker-controlled (an unauthenticated
 *  callable hashes whatever token it is handed, but a caller could also pass a hash-shaped
 *  value through a future code path), and 64 lowercase hex characters is the whole legitimate
 *  domain. Anything else fails closed rather than building a path that errors at get() with a
 *  permanent INVALID_ARGUMENT surfacing as an opaque `internal`. */
export function isSafeTokenHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
