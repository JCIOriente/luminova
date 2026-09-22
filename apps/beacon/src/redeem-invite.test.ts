import { describe, expect, it, vi } from "vitest";
import type { Role } from "@luminova/auth/roles";
import { hashInviteToken } from "./invite-token.js";
import {
  describeInviteFor,
  redeemInviteFor,
  type ClaimStatus,
  type InviteDoc,
  type RedeemDeps,
  type RedeemUser,
} from "./redeem-invite.js";

const NOW = 1_700_000_000_000;
const TOKEN = "t".repeat(43);
const HASH = hashInviteToken(TOKEN);
const GOOD_PASSWORD = "Abcde1";

function inviteDoc(over: Partial<InviteDoc> = {}): InviteDoc {
  return {
    memberId: "m1",
    uid: "u1",
    email: "ana@jci.bo",
    kind: "initial",
    issuedBy: "admin-uid",
    issuedByAdmin: true,
    issuedAtMs: NOW - 1000,
    expiresAtMs: NOW + 1000,
    status: "pending",
    ...over,
  };
}

function fakeDeps(opts: {
  invite?: InviteDoc | null;
  member?: Record<string, unknown> | null;
  user?: RedeemUser | null;
  positions?: Record<string, Role[]>;
  setPasswordThrows?: Error;
  /** Forces the CLAIM TRANSACTION to lose, independently of the pre-read — the only way to
   *  reach the mutual-exclusion branch, which the shared-status fake can never exercise. */
  claimLosesWith?: ClaimStatus;
}) {
  const calls = {
    claims: [] as string[],
    setPassword: [] as { uid: string; password: string }[],
    failed: [] as string[],
  };
  let status = opts.invite === undefined ? "pending" : (opts.invite?.status ?? "pending");
  const deps: RedeemDeps = {
    now: () => NOW,
    getInvite: async (hash) => {
      if (hash !== HASH) return null;
      if (opts.invite === undefined) return inviteDoc();
      if (opts.invite === null) return null;
      return { ...opts.invite, status: status as InviteDoc["status"] };
    },
    getMember: async () =>
      opts.member === undefined
        ? { name: "Ana Pérez", email: "ana@jci.bo", active: true, uid: "u1" }
        : opts.member,
    getUserByUid: async () => (opts.user === undefined ? { uid: "u1" } : opts.user),
    getPositionGrants: async (cargoId) => opts.positions?.[cargoId] ?? null,
    claimInvite: async (hash) => {
      calls.claims.push(hash);
      if (opts.claimLosesWith) return { claimed: false, status: opts.claimLosesWith };
      // The transaction IS the mutual-exclusion primitive: a second claim must lose.
      if (status !== "pending") return { claimed: false, status: status as InviteDoc["status"] };
      status = "used";
      return { claimed: true, status: "used" };
    },
    markInviteFailed: async (hash) => {
      calls.failed.push(hash);
      status = "failed";
    },
    setPassword: async (uid, password) => {
      calls.setPassword.push({ uid, password });
      if (opts.setPasswordThrows) throw opts.setPasswordThrows;
    },
  };
  return { deps, calls };
}

async function reasonOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (err) {
    const details = (err as { details?: { reason?: string } }).details;
    return details?.reason ?? "untagged";
  }
}

describe("describeInviteFor", () => {
  it("returns who the link belongs to, unmasked, without consuming it", async () => {
    // Showing the full address is how the invitee confirms the operator sent the right link.
    // Masking protects nobody who holds the token — they could simply redeem it.
    const { deps, calls } = fakeDeps({});
    await expect(describeInviteFor(deps, { token: TOKEN })).resolves.toEqual({
      email: "ana@jci.bo",
      name: "Ana Pérez",
      expiresAt: NOW + 1000,
    });
    expect(calls.claims).toEqual([]);
    expect(calls.setPassword).toEqual([]);
  });

  it("refuses an unknown token with the GENERIC tag", async () => {
    // The only state reachable without already holding a real token, so it must not
    // distinguish "never existed" from anything else.
    const { deps } = fakeDeps({});
    expect(await reasonOf(describeInviteFor(deps, { token: "z".repeat(43) }))).toBe(
      "invite-invalid",
    );
  });

  it.each([
    ["a non-string", 7],
    ["empty", ""],
    ["null", null],
    ["undefined", undefined],
    ["an object", { token: "x" }],
  ])("refuses %s token as invite-invalid, never a 500", async (_label, token) => {
    const { deps } = fakeDeps({});
    expect(await reasonOf(describeInviteFor(deps, { token } as never))).toBe("invite-invalid");
  });
});

describe("redeemInviteFor — invite-document validity", () => {
  it.each([
    ["expired", { expiresAtMs: NOW - 1 }, "invite-expired"],
    ["used", { status: "used" as const }, "invite-used"],
    ["revoked", { status: "revoked" as const }, "invite-revoked"],
    ["a previously failed redemption", { status: "failed" as const }, "invite-update-failed"],
  ])("refuses %s with its own tag", async (_label, over, expected) => {
    // Distinct on purpose: you cannot reach any of these without already holding a real
    // token, so naming them leaks nothing — and it is what makes the page actionable
    // ("expiró — pide otro" vs "ya la usaste — inicia sesión").
    const { deps, calls } = fakeDeps({ invite: inviteDoc(over) });
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
      expected,
    );
    expect(calls.setPassword).toEqual([]);
  });

  it("treats expiry as <= now, inclusive", async () => {
    const { deps } = fakeDeps({ invite: inviteDoc({ expiresAtMs: NOW }) });
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
      "invite-expired",
    );
  });
});

describe("redeemInviteFor — the member must still match", () => {
  it.each([
    ["the member doc vanished", null, "invite-member-missing"],
    [
      "the member went inactive",
      { name: "Ana", email: "ana@jci.bo", active: false, uid: "u1" },
      "invite-member-inactive",
    ],
    [
      // `active` and `status` are SEPARATE fields with separate writers: setStatus writes only
      // `status`, softDelete only `active`. Checking `active` alone let a link issued before an
      // expulsion still mint a working login for the expelled member days later.
      "the member was expelled but never soft-deleted",
      { name: "Ana", email: "ana@jci.bo", active: true, status: "Desafiliado", uid: "u1" },
      "invite-member-inactive",
    ],
    [
      "the email changed",
      { name: "Ana", email: "otra@jci.bo", active: true, uid: "u1" },
      "invite-email-changed",
    ],
    [
      "the account was relinked",
      { name: "Ana", email: "ana@jci.bo", active: true, uid: "u2" },
      "invite-account-changed",
    ],
  ])("refuses when %s", async (_label, member, expected) => {
    const { deps, calls } = fakeDeps({ member });
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
      expected,
    );
    expect(calls.setPassword).toEqual([]);
  });

  it("REDEEMS a mixed-case address — compared after trim().toLowerCase() on BOTH sides", async () => {
    // Identity Toolkit lower-cases what it stores while firestore.rules never constrains
    // members.email, so a CSV paste leaves `Ana@JCI.bo` on the ficha. Without normalized
    // comparison EVERY invite for a mixed-case address is dead on arrival, surfacing as the
    // generic "ya no es válido" — which reads as operator error and is near-impossible to
    // diagnose from the outside.
    const { deps, calls } = fakeDeps({
      invite: inviteDoc({ email: "  Ana@JCI.bo " }),
      member: { name: "Ana", email: "ana@jci.bo", active: true, uid: "u1" },
    });
    await expect(
      redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }),
    ).resolves.toMatchObject({ ok: true });
    expect(calls.setPassword).toHaveLength(1);
  });

  it("refuses a disabled account", async () => {
    const { deps, calls } = fakeDeps({ user: { uid: "u1", disabled: true } });
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
      "invite-account-disabled",
    );
    expect(calls.setPassword).toEqual([]);
  });

  it("refuses when the pinned Auth account no longer exists", async () => {
    const { deps } = fakeDeps({ user: null });
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
      "invite-account-changed",
    );
  });
});

describe("redeemInviteFor — the privilege guards RE-RUN at redemption", () => {
  // The token outlives the authorization decision by up to seven days. Without this: day 1 a
  // delegate issues a recovery link for a grant-free member (exactly D3's intent); day 3 an
  // Admin seats them on Tesorero; day 4 the delegate redeems the token they kept and signs in
  // as Tesorero. The same shape works on an initial invite.
  const delegateIssued = inviteDoc({ issuedByAdmin: false });

  it("refuses a member who gained a POWER CARGO after the link was minted", async () => {
    const { deps, calls } = fakeDeps({
      invite: delegateIssued,
      member: {
        name: "Ana",
        email: "ana@jci.bo",
        active: true,
        uid: "u1",
        positions: { "2026": { cargoId: "tesorero" } },
      },
      positions: { tesorero: ["Treasury"] },
    });
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
      "invite-member-now-privileged",
    );
    expect(calls.setPassword).toEqual([]);
  });

  it("refuses a member who gained DIRECT GRANTS after the link was minted", async () => {
    const { deps } = fakeDeps({
      invite: delegateIssued,
      member: { name: "Ana", email: "ana@jci.bo", active: true, uid: "u1", roleIds: ["r1"] },
    });
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
      "invite-member-now-privileged",
    );
  });

  it("refuses when the ACCOUNT gained a privileged claim after the link was minted", async () => {
    const { deps } = fakeDeps({
      invite: delegateIssued,
      user: { uid: "u1", customClaims: { roles: ["Member", "Admin"] } },
    });
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
      "invite-member-now-privileged",
    );
  });

  it("fails CLOSED on an unreadable cargo", async () => {
    const { deps } = fakeDeps({
      invite: delegateIssued,
      member: {
        name: "Ana",
        email: "ana@jci.bo",
        active: true,
        uid: "u1",
        positions: { "2026": { cargoId: "ghost" } },
      },
    });
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
      "invite-member-now-privileged",
    );
  });

  it("EXEMPTS an Admin-issued link — an Admin is subject to none of these at issue", async () => {
    // Re-imposing them at redemption would break the Admin's own recovery path, which is the
    // in-product remedy for a locked-out Admin.
    const { deps, calls } = fakeDeps({
      invite: inviteDoc({ issuedByAdmin: true }),
      member: {
        name: "Ana",
        email: "ana@jci.bo",
        active: true,
        uid: "u1",
        roleIds: ["r1"],
        positions: { "2026": { cargoId: "presidente" } },
      },
      positions: { presidente: ["Admin"] },
      user: { uid: "u1", customClaims: { roles: ["Member", "Admin"] } },
    });
    await expect(
      redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }),
    ).resolves.toMatchObject({ ok: true });
    expect(calls.setPassword).toHaveLength(1);
  });
});

describe("redeemInviteFor — claiming and the password write", () => {
  it("checks the password BEFORE claiming, so a typo does not burn the link", async () => {
    const { deps, calls } = fakeDeps({});
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: "weak" }))).toBe(
      "invite-password-weak",
    );
    expect(calls.claims).toEqual([]);
    expect(calls.setPassword).toEqual([]);
  });

  it.each([
    ["a non-string", 7],
    ["undefined", undefined],
    ["null", null],
  ])("refuses %s password as weak, never a 500", async (_label, password) => {
    // Unauthenticated, untyped input reaching .length would surface as `internal`.
    const { deps } = fakeDeps({});
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password } as never))).toBe(
      "invite-password-weak",
    );
  });

  it("claims the token THEN sets the password, on the pinned uid", async () => {
    // Order matters: a crash between burns the token (an annoyance with a one-click operator
    // remedy) rather than leaving a live token AND a set password — a replay window.
    const { deps, calls } = fakeDeps({});
    await expect(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD })).resolves.toEqual(
      { ok: true, email: "ana@jci.bo" },
    );
    expect(calls.claims).toEqual([HASH]);
    // The PINNED uid from the invite doc, never a uid re-derived from the member at redemption.
    expect(calls.setPassword).toEqual([{ uid: "u1", password: GOOD_PASSWORD }]);
  });

  it("is single-use — a second redemption loses the claim", async () => {
    const { deps, calls } = fakeDeps({});
    await redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD });
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
      "invite-used",
    );
    expect(calls.setPassword).toHaveLength(1);
  });

  it("marks the invite FAILED — not used — when the Auth write throws", async () => {
    // Without a distinct state this renders as used/green and the operator has no reason to
    // re-issue while the member still has no password.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { deps, calls } = fakeDeps({ setPasswordThrows: new Error("auth down") });
      expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
        "invite-update-failed",
      );
      expect(calls.failed).toEqual([HASH]);
      // guardrail #4: never a silent catch.
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("redeemInviteFor — secrets never reach a log line", () => {
  it("logs the outcome without the token or the password", async () => {
    const seen: unknown[] = [];
    const levels = ["log", "info", "warn", "error", "debug"] as const;
    const originals = levels.map((l) => [l, console[l]] as const);
    for (const l of levels) console[l] = (...args: unknown[]) => void seen.push(...args);
    try {
      const { deps } = fakeDeps({ setPasswordThrows: new Error("auth down") });
      await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }));
      await reasonOf(describeInviteFor(deps, { token: TOKEN }));
      const dumped = seen.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
      expect(dumped).not.toContain(TOKEN);
      expect(dumped).not.toContain(GOOD_PASSWORD);
      // The 8-char hash prefix IS logged — enough to correlate an issue with its redemption
      // in Cloud Logging, and not a credential.
      expect(dumped).toContain(HASH.slice(0, 8));
    } finally {
      for (const [l, fn] of originals) console[l] = fn;
    }
  });
});

describe("redeemInviteFor — losing the claim transaction", () => {
  // THE MUTUAL-EXCLUSION BRANCH. The shared-status fake can never reach it (a second
  // redemption is refused earlier, inside loadValidInvite), so it had no coverage at all —
  // and it is the path the single-use guarantee actually rests on when two tabs race.
  it.each([
    ["another tab redeemed first", "used", "invite-used"],
    ["it was revoked mid-flight", "revoked", "invite-revoked"],
    // Each outcome keeps its OWN tag. Telling someone their link was "superseded by a newer
    // one" when it actually expired sends them hunting for a link that does not exist; telling
    // them to "sign in with your password" after a failed write names a password never set.
    ["it expired between the read and the transaction", "expired", "invite-expired"],
    ["a previous attempt had already failed", "failed", "invite-update-failed"],
    ["the document vanished", "gone", "invite-invalid"],
  ] as const)("refuses with the right tag when %s", async (_label, status, expected) => {
    const { deps, calls } = fakeDeps({ claimLosesWith: status });
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
      expected,
    );
    // The claim was attempted and lost; no password may be written.
    expect(calls.claims).toEqual([HASH]);
    expect(calls.setPassword).toEqual([]);
  });
});

describe("redeemInviteFor — the Auth account's own address", () => {
  it("refuses when the ACCOUNT's address was changed out of band", async () => {
    // member.uid and member.email are both pinned, but the console can change the Auth
    // account's own address — and then the password lands on an account whose address is not
    // the one describeInvite showed the invitee.
    const { deps, calls } = fakeDeps({ user: { uid: "u1", email: "otra@jci.bo" } });
    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
      "invite-email-changed",
    );
    expect(calls.setPassword).toEqual([]);
  });

  it("accepts a case/whitespace difference on the account address", async () => {
    const { deps, calls } = fakeDeps({ user: { uid: "u1", email: " Ana@JCI.bo " } });
    await expect(
      redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }),
    ).resolves.toMatchObject({ ok: true });
    expect(calls.setPassword).toHaveLength(1);
  });

  it("tolerates an account with no address recorded", async () => {
    const { deps } = fakeDeps({ user: { uid: "u1" } });
    await expect(
      redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("redeemInviteFor — the password shape bound", () => {
  it("refuses an over-long password BEFORE burning the token", async () => {
    // Identity Toolkit rejects it on shape, not policy — and would do so only after the claim,
    // landing the invitee on invite-update-failed with a spent link.
    const { deps, calls } = fakeDeps({});
    expect(
      await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: `Aa1${"x".repeat(2000)}` })),
    ).toBe("invite-password-weak");
    expect(calls.claims).toEqual([]);
  });
});

describe("describeInviteFor — the address it shows", () => {
  it("shows the address NORMALIZED, as redemption will match it", async () => {
    const { deps } = fakeDeps({
      invite: inviteDoc({ email: "  Ana@JCI.bo " }),
      member: { name: "Ana", email: "ana@jci.bo", active: true, uid: "u1" },
    });
    await expect(describeInviteFor(deps, { token: TOKEN })).resolves.toMatchObject({
      email: "ana@jci.bo",
    });
  });
});
