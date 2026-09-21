import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member, MemberInviteProjection } from "@luminova/types";
import { inviteActionLabel, memberInviteState } from "./invite-state";

const NOW = new Date("2026-09-21T12:00:00Z").getTime();
const ts = (ms: number) => Timestamp.fromMillis(ms);

function withInvite(over: Partial<MemberInviteProjection> = {}, uid = "u1"): Member {
  return {
    uid,
    invite: {
      status: "pending",
      kind: "initial",
      tokenHash: "a".repeat(64),
      issuedAt: ts(NOW - 1000),
      expiresAt: ts(NOW + 1000),
      issuedBy: "admin-uid",
      usedAt: null,
      ...over,
    },
  } as unknown as Member;
}

describe("memberInviteState", () => {
  it('reads a member who was never invited as "never"', () => {
    expect(memberInviteState({} as Member, NOW)).toBe("never");
    expect(memberInviteState({ uid: "" } as Member, NOW)).toBe("never");
  });

  it('reads THE ENTIRE PRE-FEATURE ROSTER as "legacy", not "never"', () => {
    // uid && !invite. Without this branch every existing member renders "Sin invitar" on day
    // one, which makes the new column useless at launch and invites operators to re-issue
    // links for people who already have accounts — and for a delegate, each such re-issue is
    // the impersonation primitive. One derived branch, zero writes, no migration.
    expect(memberInviteState({ uid: "u1" } as Member, NOW)).toBe("legacy");
  });

  it('reads a live link as "pending"', () => {
    expect(memberInviteState(withInvite(), NOW)).toBe("pending");
  });

  it('DERIVES "expired" from the clock — no stored flag, no write', () => {
    expect(memberInviteState(withInvite({ expiresAt: ts(NOW - 1) }), NOW)).toBe("expired");
  });

  it("treats expiry as inclusive, matching beacon's `expiresAt <= now`", () => {
    expect(memberInviteState(withInvite({ expiresAt: ts(NOW) }), NOW)).toBe("expired");
  });

  it.each([
    ["used", "used"],
    ["revoked", "revoked"],
    ["failed", "failed"],
  ] as const)("passes through a stored %s status", (status, expected) => {
    // A spent invite is NOT re-derived as expired even once its expiresAt passes: what the
    // operator needs to know is that it was used/revoked/failed.
    expect(memberInviteState(withInvite({ status, expiresAt: ts(NOW - 5000) }), NOW)).toBe(
      expected,
    );
  });

  it('keeps "failed" distinct from "used"', () => {
    // The token burned and the Auth write threw. Without its own state it renders green and
    // the operator has no reason to re-issue while the member still cannot log in.
    expect(memberInviteState(withInvite({ status: "failed" }), NOW)).toBe("failed");
  });

  it("falls back to the uid-derived state on a malformed projection", () => {
    const malformed = { uid: "u1", invite: { status: "nonsense" } } as unknown as Member;
    expect(memberInviteState(malformed, NOW)).toBe("legacy");
    const noUid = { invite: { status: "nonsense" } } as unknown as Member;
    expect(memberInviteState(noUid, NOW)).toBe("never");
  });
});

describe("inviteActionLabel", () => {
  it.each([
    ["never", "Invitar acceso"],
    ["legacy", "Recuperar acceso"],
    ["used", "Recuperar acceso"],
    ["pending", "Reenviar enlace"],
    ["expired", "Generar enlace nuevo"],
    ["revoked", "Generar enlace nuevo"],
    ["failed", "Generar enlace nuevo"],
  ] as const)("labels %s as %s", (state, label) => {
    expect(inviteActionLabel(state)).toBe(label);
  });
});
