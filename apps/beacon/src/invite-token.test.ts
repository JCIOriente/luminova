import { describe, expect, it } from "vitest";
import { hashInviteToken, isSafeTokenHash, mintInviteToken } from "./invite-token.js";

describe("mintInviteToken", () => {
  it("mints 256 bits as 43 base64url characters", () => {
    // 43 chars keeps the whole link near 70 characters — one line in WhatsApp, no preview
    // truncation, safely copy-pasteable.
    const { token } = mintInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("returns the hash of the token it minted", () => {
    const { token, tokenHash } = mintInviteToken();
    expect(tokenHash).toBe(hashInviteToken(token));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never repeats", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(mintInviteToken().token);
    expect(seen.size).toBe(500);
  });
});

describe("hashInviteToken", () => {
  it("is deterministic", () => {
    expect(hashInviteToken("abc")).toBe(hashInviteToken("abc"));
  });

  it("pins the digest, so the storage key cannot silently change", () => {
    // The hash IS the document id. Changing the algorithm orphans every outstanding invite —
    // they would resolve to a different key and read as `invite-invalid` with no way back.
    expect(hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("derives a different key for a different token", () => {
    expect(hashInviteToken("abc")).not.toBe(hashInviteToken("abd"));
  });
});

describe("isSafeTokenHash", () => {
  it("accepts a real hash", () => {
    expect(isSafeTokenHash(mintInviteToken().tokenHash)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["a slash", `a/b${"c".repeat(60)}`],
    ["reserved", "__x__"],
    ["uppercase hex", "A".repeat(64)],
    ["too short", "a".repeat(63)],
    ["too long", "a".repeat(65)],
    ["non-hex", `${"a".repeat(63)}z`],
    ["a dot", "."],
    ["not a string", 7],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s", (_label, value) => {
    // A forged token must never build a weird doc path — the isSafeDocId discipline, tightened
    // to the exact shape sha256 produces.
    expect(isSafeTokenHash(value)).toBe(false);
  });
});
