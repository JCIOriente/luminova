import { describe, expect, it } from "vitest";
import { INVITE_PURGE_MS, INVITE_TTL_MS } from "./member-invite.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// These two are the only place the link's lifetime is decided, and beacon computes both
// timestamps from them. Every other test in the repo asserts `NOW + INVITE_TTL_MS`, which is
// true at any value — so nothing pinned the DURATION itself, and shortening or lengthening it
// was a one-digit edit no test could see. Changing a credential's validity window should be a
// deliberate act that shows up in a diff as a changed expectation.

describe("INVITE_TTL_MS — how long a link stays redeemable", () => {
  it("is 48 hours", () => {
    expect(INVITE_TTL_MS).toBe(48 * HOUR);
  });

  it("spans at least one overnight, so a link sent in the evening survives to the morning", () => {
    // The floor the operator flow needs: the chapter shares links over WhatsApp and people
    // read them the next day. Anything under ~24 h makes an evening send unreliable.
    expect(INVITE_TTL_MS).toBeGreaterThanOrEqual(DAY);
  });

  it("stays well short of the purge horizon", () => {
    // Expiry is the SECURITY boundary and is enforced in code; purge is retention and is
    // enforced by the Firestore TTL policy, which lags up to ~24 h. If expiry ever crept up
    // to purge, a document could be reaped while its token was still redeemable — and a
    // reaped document reads as `gone`, which the invitee sees as the generic "no es válido"
    // rather than "venció".
    expect(INVITE_TTL_MS * 2).toBeLessThan(INVITE_PURGE_MS);
  });
});

describe("INVITE_PURGE_MS — when the document is reaped", () => {
  it("is 90 days, unchanged by the expiry window", () => {
    // Deliberately NOT shortened alongside the TTL. The two answer different questions, and
    // beacon computes `purgeAt` from `issuedAt`, independent of `expiresAt`. A used or revoked
    // invite document is not a credential — it is the audit trail for who issued a login and
    // when — so shrinking the retention window would cost evidence and buy no security.
    expect(INVITE_PURGE_MS).toBe(90 * DAY);
  });
});
