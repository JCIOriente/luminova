import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@luminova/auth/roles";
import { hashInviteToken } from "./invite-token.js";
import {
  describeInviteFor,
  redeemInviteFor,
  type ClaimStatus,
  type InviteDoc,
  type RedeemDeps,
  createRateGate,
  UNAUTHENTICATED_CALL,
  UNAUTHENTICATED_CALLABLES,
  type RateGate,
  type RedeemUser,
} from "./redeem-invite.js";
import { createRateLimiter } from "./rate-limit.js";
import {
  INVITE_GLOBAL_DENIAL_PER_SECOND,
  INVITE_GLOBAL_READS_PER_MINUTE,
  INVITE_RATE_LIMITS,
} from "@luminova/types/member-invite";

const NOW = 1_700_000_000_000;
const TOKEN = "t".repeat(43);
const HASH = hashInviteToken(TOKEN);
const GOOD_PASSWORD = "Abcde1";

/** The REAL production gate. `createRateGate()` rather than a hand-rebuilt copy: an earlier
 *  version retyped the bucket parameters as literals, so retuning `INVITE_RATE_LIMITS` would
 *  have left every test running against the OLD production shape with nothing failing — which
 *  is exactly what those constants exist to prevent. Built per `fakeDeps()` call, so each test
 *  starts with cold buckets. */

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
  /** Override only to drive the limiter itself; every other test runs the REAL gate at the
   *  production windows, so a regression that bypasses it fails here rather than in prod. */
  gate?: RateGate;
}) {
  const calls = {
    claims: [] as string[],
    setPassword: [] as { uid: string; password: string }[],
    failed: [] as string[],
  };
  let status = opts.invite === undefined ? "pending" : (opts.invite?.status ?? "pending");
  const gate = opts.gate ?? createRateGate();
  const deps: RedeemDeps = {
    now: () => NOW,
    gate,
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
  // The token outlives the authorization decision by up to 48 h. Without this: hour 1 a
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

describe("the rate gate in front of both callables", () => {
  /** A gate wrapping the REAL limiter, plus a count of how many times each bucket was asked.
   *  Deliberately not a stub that always admits: the point of these tests is that the shipped
   *  limiter refuses, in the right order, before any I/O. */
  function countingGate(over: { perToken?: number; global?: number } = {}) {
    const perToken = createRateLimiter({
      capacity: over.perToken ?? INVITE_RATE_LIMITS.perTokenPerMinute,
      windowMs: INVITE_RATE_LIMITS.windowMs,
      maxKeys: INVITE_RATE_LIMITS.tokenBuckets,
    });
    const global = createRateLimiter({
      capacity: over.global ?? INVITE_RATE_LIMITS.globalPerMinute,
      windowMs: INVITE_RATE_LIMITS.windowMs,
      maxKeys: 1,
    });
    const asked = { global: 0, token: [] as string[] };
    const gate: RateGate = {
      admitGlobal: (nowMs) => {
        asked.global += 1;
        return global.tryConsume("*", nowMs);
      },
      admitToken: (hash, nowMs) => {
        asked.token.push(hash);
        return perToken.tryConsume(hash, nowMs);
      },
      // `shouldLogRefusal` omitted: optional, and defaults to logging every refusal. These
      // tests assert which bucket was charged and whether a read happened, so a suppressed
      // log line must not be confusable with a suppressed refusal.
    };
    return { gate, asked };
  }

  it("refuses the 6th call on one token, and the refusal reads no Firestore", async () => {
    const { gate } = countingGate();
    const reads: string[] = [];
    const { deps } = fakeDeps({ gate });
    const counted: RedeemDeps = {
      ...deps,
      getInvite: async (hash) => {
        reads.push(hash);
        return deps.getInvite(hash);
      },
    };

    for (let i = 0; i < 5; i += 1) {
      await expect(describeInviteFor(counted, { token: TOKEN })).resolves.toMatchObject({
        email: "ana@jci.bo",
      });
    }
    expect(reads).toHaveLength(5);

    expect(await reasonOf(describeInviteFor(counted, { token: TOKEN }))).toBe(
      "invite-too-many-attempts",
    );
    // THE POINT OF THE WHOLE DESIGN: a throttled request must cost less than the work it
    // prevents. Still 5 — the refused call issued no read, so the limiter can never become
    // the cheapest way to run up a Firestore bill on an unauthenticated endpoint.
    expect(reads).toHaveLength(5);
  });

  it("charges the GLOBAL bucket before the token is even hashed, so junk cannot bypass it", async () => {
    // A flood of malformed tokens never reaches `admitToken` (there is no hash to charge), so
    // if the global bucket were charged after the hash this would be a free unbounded channel.
    const { gate, asked } = countingGate({ global: 3 });
    const { deps } = fakeDeps({ gate });

    for (let i = 0; i < 3; i += 1) {
      expect(await reasonOf(describeInviteFor(deps, { token: 7 as never }))).toBe("invite-invalid");
    }
    expect(await reasonOf(describeInviteFor(deps, { token: 7 as never }))).toBe(
      "invite-too-many-attempts",
    );
    expect(asked.global).toBe(4);
    // Never keyed, because a malformed token has no hash.
    expect(asked.token).toEqual([]);
  });

  it("bounds a flood of DISTINCT tokens, which the per-token bucket alone cannot", async () => {
    // The abuse case that actually threatens availability: every random token gets its own
    // fresh per-token budget, so only the endpoint-wide bucket stops this.
    const { gate } = countingGate({ global: 10 });
    const reads: string[] = [];
    const { deps } = fakeDeps({ gate });
    const counted: RedeemDeps = {
      ...deps,
      getInvite: async (hash) => {
        reads.push(hash);
        return deps.getInvite(hash);
      },
    };

    const reasons: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      reasons.push(await reasonOf(describeInviteFor(counted, { token: `tok-${i}`.repeat(6) })));
    }
    // First 10 are admitted and refused on the merits (unknown token); the rest are throttled.
    expect(reasons.filter((r) => r === "invite-invalid")).toHaveLength(10);
    expect(reasons.filter((r) => r === "invite-too-many-attempts")).toHaveLength(15);
    // 15 floods' worth of Firestore reads never happened.
    expect(reads).toHaveLength(10);
  });

  it("never lets one token's exhaustion refuse a DIFFERENT invitee", async () => {
    // Why the per-token bucket is the one that may be tight: it is structurally incapable of
    // denying anyone but the token being hammered.
    const { gate } = countingGate();
    const { deps } = fakeDeps({ gate });
    const other = "o".repeat(43);

    for (let i = 0; i < 6; i += 1) await reasonOf(describeInviteFor(deps, { token: TOKEN }));
    expect(await reasonOf(describeInviteFor(deps, { token: TOKEN }))).toBe(
      "invite-too-many-attempts",
    );
    // A different token still gets a full budget, and is refused on the MERITS, not throttled.
    expect(await reasonOf(describeInviteFor(deps, { token: other }))).toBe("invite-invalid");
  });

  it("throttles redeemInvite BEFORE the claim, so a throttled call cannot burn the token", async () => {
    const { gate } = countingGate({ perToken: 1 });
    const { deps, calls } = fakeDeps({ gate });

    await expect(
      redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }),
    ).resolves.toMatchObject({ ok: true });
    expect(calls.claims).toEqual([HASH]);

    expect(await reasonOf(redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }))).toBe(
      "invite-too-many-attempts",
    );
    // No second claim attempt and no password write: the token is not spent by being throttled.
    expect(calls.claims).toEqual([HASH]);
    expect(calls.setPassword).toHaveLength(1);
  });

  it("clears on its own as the bucket refills, without a new link", async () => {
    // A rate-limited invitee must not need an operator. 5 per 60 s refills one slot every
    // 12 s, and the deps clock is what the gate is charged against.
    const perToken = createRateLimiter({ capacity: 5, windowMs: 60_000, maxKeys: 8 });
    const global = createRateLimiter({ capacity: 60, windowMs: 60_000, maxKeys: 1 });
    let clock = NOW;
    const gate: RateGate = {
      admitGlobal: (nowMs) => global.tryConsume("*", nowMs),
      admitToken: (hash, nowMs) => perToken.tryConsume(hash, nowMs),
    };
    // The invite must outlive the clock advance below, or the refill assertion is answered by
    // `invite-expired` instead of the gate. The default fixture expires 1 s after NOW.
    const base = fakeDeps({ gate, invite: inviteDoc({ expiresAtMs: NOW + 60_000 }) }).deps;
    const deps: RedeemDeps = { ...base, now: () => clock };

    for (let i = 0; i < 5; i += 1) await describeInviteFor(deps, { token: TOKEN });
    expect(await reasonOf(describeInviteFor(deps, { token: TOKEN }))).toBe(
      "invite-too-many-attempts",
    );

    clock = NOW + 11_999;
    expect(await reasonOf(describeInviteFor(deps, { token: TOKEN }))).toBe(
      "invite-too-many-attempts",
    );
    clock = NOW + 12_000;
    await expect(describeInviteFor(deps, { token: TOKEN })).resolves.toMatchObject({
      email: "ana@jci.bo",
    });
  });
});

describe("the shipped configuration of the two unauthenticated callables", () => {
  // These assert the REAL exported gate and options object, not a fixture. Retuning a
  // security-relevant ceiling or dropping a control then shows up in the diff as a changed
  // test rather than one silently edited digit.

  it("admits exactly 5 calls per token per minute", async () => {
    const gate = createRateGate();
    const hash = "a".repeat(64);
    let admitted = 0;
    while (gate.admitToken(hash, NOW)) admitted += 1;
    expect(admitted).toBe(5);
    expect(INVITE_RATE_LIMITS.perTokenPerMinute).toBe(5);
  });

  it("admits 600 calls per minute endpoint-wide — far above any legitimate burst", async () => {
    // Raised from 60 deliberately. At 60 ONE sustained request per second from a single
    // source denied every invitee on the only onboarding path — the limiter made a total
    // outage far cheaper to cause than saturating the instance pool it nominally protects.
    // 600 keeps a real cost bound (INVITE_GLOBAL_READS_PER_MINUTE, on ONE instance) and moves
    // the denial threshold to INVITE_GLOBAL_DENIAL_PER_SECOND — both DERIVED, both pinned by
    // the tripwire below rather than retyped here.
    //
    // NOT ~100 req/s: the ceiling is per instance, but refusals do not multiply it by
    // `maxInstances`. The reason is LATENCY, not the absence of I/O — Cloud Run's concurrency
    // signal is in-flight requests over the concurrency limit, and a refusal is in flight for
    // microseconds, so it takes thousands per second to dent 80 slots. CPU utilization is a
    // separate signal a big enough flood does trip, so one instance is a conservative FLOOR
    // rather than a guarantee. Canonical: the `globalPerMinute` docblock in
    // packages/types/src/member-invite.ts.
    const gate = createRateGate();
    let admitted = 0;
    while (gate.admitGlobal(NOW)) admitted += 1;
    expect(admitted).toBe(600);
    // The global ceiling must stay STRICTLY ABOVE the per-token one. If they were equal, five
    // invitees opening links in the same minute would exhaust the endpoint and the sixth
    // would be refused with no abuse at all — a self-inflicted outage on the only onboarding
    // path there is.
    // Not merely greater — ORDERS greater. If the endpoint ceiling sat anywhere near the
    // per-token one, a handful of invitees opening links together would exhaust it with no
    // abuse at all, and the refusal would land on real people with no operator remedy.
    expect(INVITE_RATE_LIMITS.globalPerMinute).toBeGreaterThanOrEqual(
      INVITE_RATE_LIMITS.perTokenPerMinute * 100,
    );
  });

  it("TRIPWIRE: the ceiling's derived figures, and where they are quoted in prose", () => {
    // The sibling of the INVITE_RETRY_AFTER_SECONDS tripwire, and it exists because the
    // figures below were hand-written into prose in six places and were wrong in all six,
    // twice — while the one constant that WAS derived and tripwired has never been wrong.
    //
    // WHEN THIS FIRES, these are the prose sites that restate it. Update them, then update
    // this test. Do not route around it, and do not grep for the number instead — this list
    // is the substitute for the grep that missed four copies last time:
    //
    //   1. packages/types/src/member-invite.ts  — `globalPerMinute` docblock (CANONICAL)
    //   2. apps/beacon/src/rate-limit.ts        — the shared-fate paragraph
    //   3. apps/beacon/CLAUDE.md                — the rate-limiting bullet
    //   4. docs/firebase-setup.md               — the operator bullet AND the alert policy,
    //                                             whose threshold must stay UNDER this figure
    //   5. docs/specs/invite-link-onboarding.md — Amendment 2
    expect(INVITE_GLOBAL_DENIAL_PER_SECOND).toBe(10);
    expect(INVITE_GLOBAL_READS_PER_MINUTE).toBe(1_200);

    // The whole-deployment read bound. It lives HERE and not in @luminova/types because it
    // needs `maxInstances`, a Cloud Functions option that package cannot see — which is how an
    // earlier draft came to print the saturated-pool figure as the single-instance one.
    expect(INVITE_GLOBAL_READS_PER_MINUTE * UNAUTHENTICATED_CALL.maxInstances).toBe(12_000);

    // The alert must warn BEFORE the ceiling denies, never after. If the ceiling is retuned,
    // docs/firebase-setup.md's `--if` threshold moves with it.
    //
    // Since App Check enforcement the two figures count DIFFERENT request populations: the
    // alert is built on Cloud Run's request_count, which includes App-Check-rejected calls
    // (401), while this ceiling only ever sees calls that reached our handler. The assertion
    // stays valid and errs in the safe direction — the alert can only fire earlier than the
    // ceiling denies, never later — but do not read the pair as measuring one thing. The
    // response-code table in docs/firebase-setup.md is what separates them.
    const ALERT_THRESHOLD_PER_SECOND = 8;
    expect(ALERT_THRESHOLD_PER_SECOND).toBeLessThan(INVITE_GLOBAL_DENIAL_PER_SECOND);
  });

  it("bounds token buckets, so a flood cannot grow memory without limit", () => {
    // Exact, not `<= 4096`: a loose bound let the shipped figure silently double, while the
    // neighbouring ceilings were pinned precisely. ~300 bytes per entry puts 2048 well under a
    // megabyte against a 256MiB instance.
    expect(INVITE_RATE_LIMITS.tokenBuckets).toBe(2048);
  });

  it("enforces App Check in production and caps instances", () => {
    // enforceAppCheck bounds WHO may call; the gate above bounds HOW OFTEN. Both ship,
    // because a standard App Check token lives ~30 min and is replayable — harvesting one
    // from the public page and flooding with it is open with enforcement on.
    //
    // FUNCTIONS_EMULATOR is unset here, which is also what a deploy-time discovery run sees,
    // so this is the value production actually gets.
    expect(process.env.FUNCTIONS_EMULATOR).toBeUndefined();
    expect(UNAUTHENTICATED_CALL.enforceAppCheck).toBe(true);
    expect(UNAUTHENTICATED_CALL.maxInstances).toBe(10);
  });

  it("disables App Check enforcement UNDER THE EMULATOR, or local /invitacion is unusable", async () => {
    // `enforceAppCheck` is enforced by firebase-functions ITSELF, not by the App Check
    // service: a request with no `X-Firebase-AppCheck` header is rejected outright, and the
    // MISSING branch returns before the FIREBASE_DEBUG_MODE escape, so a debug token cannot
    // rescue it. Local dev deliberately leaves VITE_APPCHECK_SITE_KEY blank, so the client
    // sends no header at all — unconditional enforcement would make the ONE route a developer
    // most needs to exercise impossible to run against the emulator.
    //
    // Both branches are pinned because the failure directions are opposite and both silent:
    // enforcing under the emulator breaks local onboarding, and NOT enforcing in production
    // removes the control entirely.
    vi.stubEnv("FUNCTIONS_EMULATOR", "true");
    vi.resetModules();
    try {
      const underEmulator = await import("./redeem-invite.js");
      expect(underEmulator.UNAUTHENTICATED_CALL.enforceAppCheck).toBe(false);
      // Everything else must be unchanged — this switch is about App Check alone. The rate
      // ceilings cannot vary with the environment at all now: they live in @luminova/types,
      // so the gate this module builds under the emulator is the production gate.
      expect(underEmulator.UNAUTHENTICATED_CALL.maxInstances).toBe(10);
      expect(underEmulator.UNAUTHENTICATED_CALL.concurrency).toBe(80);
      let admitted = 0;
      const emulatorGate = underEmulator.createRateGate();
      while (emulatorGate.admitToken("a".repeat(64), NOW)) admitted += 1;
      expect(admitted).toBe(INVITE_RATE_LIMITS.perTokenPerMinute);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe("the invite callables refuse while token verification is bypassed", () => {
  // Cleanup in ONE place rather than a try/finally per test: three copies each had to remember
  // both calls. Stubbing stays inline, so what each test controls is still visible where it runs.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // The guard itself, its parity with the real firebase-functions gate, its log sampling and its
  // emulator carve-out are covered in `token-verification-bypass.test.ts`. What belongs HERE is
  // the wiring: that both invite entry points actually reach it, and that they reach it before
  // spending anything.

  function stubBypass(): void {
    vi.stubEnv("FIREBASE_DEBUG_MODE", "true");
    vi.stubEnv("FIREBASE_DEBUG_FEATURES", JSON.stringify({ skipTokenVerification: true }));
  }

  it.each([
    ["describeInvite", (deps: RedeemDeps) => describeInviteFor(deps, { token: TOKEN })],
    [
      "redeemInvite",
      (deps: RedeemDeps) => redeemInviteFor(deps, { token: TOKEN, password: GOOD_PASSWORD }),
    ],
  ])("refuses %s outright, tagged so the page can tell it apart", async (_name, call) => {
    // BOTH entry points, because both take UNAUTHENTICATED_CALL. Writing one and calling it done
    // is the easy miss here.
    const { deps, calls } = fakeDeps({});
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubBypass();
    {
      // TAGGED, and that is load-bearing on the client: a BARE `internal` is also what an
      // uncaught transient failure produces (a Firestore `unavailable` inside `getInvite`), and
      // the two need opposite affordances — retry now versus never, since this condition lasts as
      // long as the container. `invite-error.ts` keys a no-retry refusal on this reason, and its
      // own test pins that an untagged `functions/internal` stays retryable.
      expect(await reasonOf(call(deps))).toBe("invite-service-misconfigured");
      // The CODE too, not just the reason. The client's fixture has to carry the same shape, and
      // for one revision it did not — it used `internal`, which this path never emits, and passed
      // because the tag is read first. Pinning both ends is what keeps the two in step.
      await expect(call(deps)).rejects.toMatchObject({ code: "failed-precondition" });
      expect(calls.claims).toEqual([]);
      expect(calls.setPassword).toEqual([]);
    }
  });

  it("refuses BEFORE the rate gate is charged and before any read", async () => {
    // The ordering the `loadValidInvite` comment makes the point of, which nothing asserted: the
    // previous test's empty `calls.claims`/`calls.setPassword` are VACUOUS for describeInvite,
    // which never claims or sets a password on any path, so moving the guard later inside
    // `loadValidInvite` would not have failed anything. This gate throws if consulted at all.
    const consulted: string[] = [];
    const gate: RateGate = {
      admitGlobal: () => {
        consulted.push("admitGlobal");
        return true;
      },
      admitToken: () => {
        consulted.push("admitToken");
        return true;
      },
    };
    const reads: string[] = [];
    const base = fakeDeps({ gate }).deps;
    const deps: RedeemDeps = {
      ...base,
      getInvite: async (hash) => {
        reads.push(hash);
        return inviteDoc();
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubBypass();
    {
      expect(await reasonOf(describeInviteFor(deps, { token: TOKEN }))).toBe(
        "invite-service-misconfigured",
      );
      // Neither bucket charged — a refused request must not consume a real invitee's budget —
      // and no Firestore read issued.
      expect(consulted).toEqual([]);
      expect(reads).toEqual([]);
    }
  });

  it.each([
    ["the mode is off", "false", JSON.stringify({ skipTokenVerification: true })],
    ['the mode is not the literal "true"', "1", JSON.stringify({ skipTokenVerification: true })],
    ["the features value is unparseable", "true", "skipTokenVerification"],
    ["the features object omits the key", "true", JSON.stringify({ somethingElse: true })],
    ["the features key is falsy", "true", JSON.stringify({ skipTokenVerification: false })],
    ["the features value is not an object", "true", "42"],
    ["the features value is an empty string", "true", ""],
    ["the features value is ABSENT", "true", undefined],
  ])("keeps serving when %s — the bypass is INERT there", async (_label, mode, features) => {
    // The rows that distinguish the real predicate from a presence check on the two key names.
    // `vi.stubEnv` DELETES the key when given undefined, which is what makes the last row
    // genuinely "absent" rather than a second empty-string case — the earlier version of this
    // table claimed absence and stubbed "" for it.
    const { deps } = fakeDeps({});
    vi.stubEnv("FIREBASE_DEBUG_MODE", mode);
    vi.stubEnv("FIREBASE_DEBUG_FEATURES", features);
    await expect(describeInviteFor(deps, { token: TOKEN })).resolves.toMatchObject({
      email: "ana@jci.bo",
    });
  });
});

describe("the services deploy.yml asserts the environment of", () => {
  // DERIVED, not enumerated. The list must cover EVERY deployed callable — the debug flag forges
  // Auth ID tokens, so the five authenticated callables are the ones with the most reach — and
  // `__endpoint.callableTrigger` distinguishes a callable from an event trigger on the object
  // `onCall` returns. So the source of truth is `index.ts`, which is also what actually gets
  // deployed; no hand-maintained list, and no scanning source text.
  //
  // This replaces a first version that pinned deploy.yml's args to UNAUTHENTICATED_CALLABLES.
  // That conflated two different sets and had teeth: widening the assertion to the authenticated
  // callables — the correct fix — would have turned the tripwire RED.
  const DEPLOY_YML = new URL("../../../.github/workflows/deploy.yml", import.meta.url);
  const SCRIPT = "assert-deployed-env-clean.sh";

  const indentOf = (line: string): number => line.length - line.trimStart().length;

  /** The lines belonging to `start`: everything indented deeper than it. ONE primitive for both
   *  scans below, which were two copies of the same indent bookkeeping — and that bookkeeping has
   *  already been wrong once, walking to the next `- ` and swallowing the following step's
   *  comments into the argument list. `stopAtGap` is the only difference: a folded plain scalar
   *  ends at a blank or comment line, a step's key block does not. */
  function linesUnder(lines: string[], start: number, stopAtGap: boolean): string[] {
    const indent = indentOf(lines[start] as string);
    const out: string[] = [lines[start] as string];
    for (let n = start + 1; n < lines.length; n += 1) {
      const line = lines[n] as string;
      const blank = line.trim() === "" || line.trimStart().startsWith("#");
      if (stopAtGap && blank) break;
      if (!blank && indentOf(line) <= indent) break;
      out.push(line);
    }
    return out;
  }

  /** PURE, and separated from the file read on purpose.
   *
   *  The four fail-open modes below are properties of this function, not of the workflow that
   *  happens to be checked in — and mutating the real `deploy.yml` can only exercise the cases it
   *  already contains. Two mutants proved that: flipping the step scan's stop condition, and
   *  moving its indent boundary, both left every assertion green, because today's step holds no
   *  comment before its keys and no later step carries `if:`. So the modes are asserted directly,
   *  against fixtures, and `assertStep()` below just feeds this the real file.
   *
   *  Returns the service arguments; THROWS with a named reason on anything it will not vouch for. */
  function parseAssertStep(lines: string[]): string[] {
    const hits = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.includes(SCRIPT) && !line.trimStart().startsWith("#"));

    // Fail-open #1: a second invocation — a staging or dry-run step above — silently retargeted
    // the `.find()` this replaced, so the prod step's args were never the ones checked.
    if (hits.length !== 1)
      throw new Error(`expected exactly one ${SCRIPT} invocation, got ${hits.length}`);
    const { line, i } = hits[0] as { line: string; i: number };
    // Fail-open #2: the script name in the step's `name:` parsed that line instead of its `run:`.
    if (!line.includes("run:"))
      throw new Error(`${SCRIPT} must appear in the step's run:, not its name`);

    // Fail-open #3: the command folds onto deeper-indented lines, and a scan that ignored that
    // read only the first line's arguments.
    //
    // This scan encodes a BELIEF about how YAML folds a plain scalar, which is the same belief the
    // assertion would be validating — so it was checked against a real parser rather than reasoned
    // about: `yaml.safe_load` on deploy.yml yields one command carrying all seven service names,
    // matching what this produces. Re-check that way, not by re-reading this code, if the step is
    // ever reformatted.
    const command = linesUnder(lines, i, true).join(" ");

    // Fail-open #4: `if:` or `continue-on-error:` on the step made it assert nothing at all. Walk
    // back to the step's own `- ` so its keys are in view — and do NOT stop at a comment, or a
    // comment sitting above those keys would hide them.
    let from = i;
    while (from > 0 && !lines[from]!.trimStart().startsWith("- ")) from -= 1;
    const block = linesUnder(lines, from, false);
    for (const forbidden of ["if:", "continue-on-error:"]) {
      if (block.some((l) => l.trimStart().startsWith(forbidden)))
        throw new Error(`the ${SCRIPT} step must not carry ${forbidden} — it would stop gating`);
    }

    return command
      .slice(command.indexOf(SCRIPT))
      .split(/\s+/)
      .slice(1)
      .filter((a) => a.length > 0);
  }

  function assertStep(): string[] {
    return parseAssertStep(readFileSync(DEPLOY_YML, "utf8").split("\n"));
  }

  describe("the parse fails CLOSED, asserted against fixtures not just the checked-in workflow", () => {
    const GOOD = [
      "    steps:",
      "      # a comment above the step",
      "      - name: Assert token verification is not bypassed on the DEPLOYED callables",
      `        run: bash .github/scripts/${SCRIPT} alpha bravo`,
      "          charlie",
      "      # a comment belonging to the NEXT step",
      "      - name: Something else",
      "        run: echo hi",
      "",
    ];

    it("reads a folded plain scalar as one command", () => {
      // Three args, the third on a continuation line — the shape deploy.yml actually uses.
      expect(parseAssertStep(GOOD)).toEqual(["alpha", "bravo", "charlie"]);
    });

    it("does not swallow the next step's comment into the argument list", () => {
      // The bug the merged primitive already had once.
      expect(parseAssertStep(GOOD)).not.toContain("belonging");
    });

    it.each([
      [
        "a second invocation elsewhere",
        [...GOOD.slice(0, 2), `        run: echo ${SCRIPT} decoy`, ...GOOD.slice(2)],
        /exactly one/,
      ],
      [
        "the script named only in the step's name:",
        [
          "      - name: run .github/scripts/" + SCRIPT + " alpha",
          "        run: echo unrelated",
          "",
        ],
        /must appear in the step's run:/,
      ],
      [
        "if: on the step",
        [...GOOD.slice(0, 3), "        if: false", ...GOOD.slice(3)],
        /must not carry if:/,
      ],
      [
        "continue-on-error: on the step",
        [...GOOD.slice(0, 3), "        continue-on-error: true", ...GOOD.slice(3)],
        /must not carry continue-on-error:/,
      ],
      [
        "a comment hiding if: from the step scan",
        [...GOOD.slice(0, 3), "        # sneaky", "        if: false", ...GOOD.slice(3)],
        /must not carry if:/,
      ],
      [
        "if: on a LATER step, which must NOT be attributed to this one",
        // The negative of the case above: over-collecting past the step boundary would make this
        // throw. It must parse cleanly instead — which is what pins the indent comparison.
        [...GOOD.slice(0, 7), "        if: false", ...GOOD.slice(7)],
        null,
      ],
    ])("%s", (_label, lines, expected) => {
      if (expected === null)
        expect(parseAssertStep(lines as string[])).toEqual(["alpha", "bravo", "charlie"]);
      else expect(() => parseAssertStep(lines as string[])).toThrow(expected as RegExp);
    });
  });

  it("covers every callable index.ts actually deploys", async () => {
    const entry: Record<string, unknown> = await import("./index.js");
    const callables = Object.entries(entry)
      .filter(([, v]) => {
        const endpoint = (v as { __endpoint?: { callableTrigger?: unknown } })?.__endpoint;
        return typeof v === "function" && endpoint !== undefined && !!endpoint.callableTrigger;
      })
      .map(([name]) => name.toLowerCase())
      .sort();

    // Sanity: the derivation must find something, or an empty list would match an empty args
    // list and this whole test would assert nothing.
    expect(callables.length).toBeGreaterThanOrEqual(7);
    // Cloud Run lower-cases the service name, so the EXPECTATION is lowercased and deploy.yml
    // must spell it that way too — the previous comment here claimed the comparison was
    // case-insensitive, which was backwards: the args are taken verbatim.
    expect(assertStep().sort()).toEqual(callables);
  });

  it("names the two unauthenticated callables among them", () => {
    // UNAUTHENTICATED_CALLABLES keeps its own narrower meaning; this is the only place the two
    // lists are related, and it is a subset check rather than an equality one.
    expect(assertStep()).toEqual(
      expect.arrayContaining([...UNAUTHENTICATED_CALLABLES].map((n) => n.toLowerCase())),
    );
  });
});

describe("the unauthenticated callables are exactly the ones declared so", () => {
  it("names every onCall export of this module, and nothing else", async () => {
    const mod: Record<string, unknown> = await import("./redeem-invite.js");
    const callables = Object.entries(mod)
      .filter(([, v]) => typeof v === "function" && "__endpoint" in (v as object))
      .map(([k]) => k)
      .sort();
    expect(callables).toEqual([...UNAUTHENTICATED_CALLABLES].sort());
  });

  it("is reachable from index.ts, or it is never deployed at all", async () => {
    // The third leg of the fan-out, previously named in a comment and enforced by nothing:
    // deleting a re-export from index.ts left both other tripwires green while the callable
    // simply vanished from the deploy, and the post-deploy script tolerates an absent service
    // with a warning.
    const entry: Record<string, unknown> = await import("./index.js");
    expect(Object.keys(entry)).toEqual(expect.arrayContaining([...UNAUTHENTICATED_CALLABLES]));
  });

  it("were each built with UNAUTHENTICATED_CALL, not merely listed", async () => {
    // The premise the list's name asserts, previously unchecked: a future
    // `onCall({ maxInstances: 1 }, ...)` in this module would be forced into a constant called
    // UNAUTHENTICATED_CALLABLES. `enforceAppCheck` is not serialized into `__endpoint`, so this
    // compares the options that ARE — which is why it is a check on these two callables rather
    // than a fingerprint used to identify unknown ones.
    const mod: Record<string, unknown> = await import("./redeem-invite.js");
    for (const name of UNAUTHENTICATED_CALLABLES) {
      const endpoint = (mod[name] as { __endpoint: Record<string, unknown> }).__endpoint;
      expect(endpoint.concurrency, name).toBe(UNAUTHENTICATED_CALL.concurrency);
      expect(endpoint.maxInstances, name).toBe(UNAUTHENTICATED_CALL.maxInstances);
      expect(endpoint.timeoutSeconds, name).toBe(UNAUTHENTICATED_CALL.timeoutSeconds);
    }
  });
});

describe("refusal logging is sampled, not one line per refusal", () => {
  // A Cloud Logging write is a billed write to a Google service on a path anyone can reach.
  // The bucket caps GRANTS, never refusals — past the ceiling every arriving request is
  // refused, so a 1,000 req/s flood produces ~1,000 refusals/second — and one line apiece
  // would bury the very stream an operator reads. That unboundedness is the whole reason
  // `shouldLogRefusal` exists; do not retune it against the 600/min ceiling.

  it("logs the FIRST refusal but not every one", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const { deps } = fakeDeps({});
      for (let i = 0; i < 5; i += 1) await describeInviteFor(deps, { token: TOKEN });
      info.mockClear();

      for (let i = 0; i < 20; i += 1) {
        await reasonOf(describeInviteFor(deps, { token: TOKEN }));
      }
      const throttleLines = info.mock.calls.filter(([, meta]) =>
        String((meta as { outcome?: unknown })?.outcome).startsWith("rate-limited"),
      );
      // At least one — silence would make throttling invisible.
      expect(throttleLines.length).toBeGreaterThanOrEqual(1);
      // But nothing like 20. The sampler admits one per bucket per 10 s and the clock is
      // frozen, so exactly one window is open.
      expect(throttleLines.length).toBeLessThan(20);
    } finally {
      info.mockRestore();
    }
  });

  it("logs a throttle line again once the sampling window passes", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      let clock = NOW;
      const base = fakeDeps({ invite: inviteDoc({ expiresAtMs: NOW + 600_000 }) }).deps;
      const deps: RedeemDeps = { ...base, now: () => clock };
      for (let i = 0; i < 5; i += 1) await describeInviteFor(deps, { token: TOKEN });

      const countThrottleLines = () =>
        info.mock.calls.filter(([, meta]) =>
          String((meta as { outcome?: unknown })?.outcome).startsWith("rate-limited"),
        ).length;

      info.mockClear();
      await reasonOf(describeInviteFor(deps, { token: TOKEN }));
      const first = countThrottleLines();
      expect(first).toBe(1);

      // Same window: suppressed.
      await reasonOf(describeInviteFor(deps, { token: TOKEN }));
      expect(countThrottleLines()).toBe(first);

      // A later window: audible again, so a LONG flood is not silent after its first second.
      clock = NOW + 10_000;
      await reasonOf(describeInviteFor(deps, { token: TOKEN }));
      expect(countThrottleLines()).toBe(first + 1);
    } finally {
      info.mockRestore();
    }
  });

  it("pins concurrency, so the stated per-instance ceiling matches what deploys", () => {
    // The limiter's honest ceiling is "per minute PER INSTANCE", which is only meaningful if
    // the number of instances is bounded AND their concurrency is known. Left unset, the
    // Firebase CLI derives it from memory (256MiB -> cpu 1 -> DEFAULT_CONCURRENCY 80); pinning
    // it means a memory change cannot silently move the ceiling.
    expect(UNAUTHENTICATED_CALL.concurrency).toBe(80);
  });
});
