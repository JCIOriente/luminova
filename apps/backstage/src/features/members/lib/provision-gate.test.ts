import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { currentTermKey, type Member, type Position } from "@luminova/types";
import { draftProvisionBlocked, memberProvisionBlocked, type CargoLookup } from "./provision-gate";

const POWER = "pos-power";
const PLAIN = "pos-plain";

const catalog: CargoLookup = (id) =>
  ({
    [POWER]: { grants: ["Secretary"] as Position["grants"] },
    [PLAIN]: { grants: [] as Position["grants"] },
  })[id];

function member(p: Partial<Member> = {}): Member {
  return {
    id: "m1",
    name: "Ana",
    email: "a@jci.bo",
    joinDate: Timestamp.now(),
    birthdate: Timestamp.now(),
    status: "Activo",
    profilePicture: null,
    totalPoints: 0,
    active: true,
    deletedAt: null,
    ...p,
  };
}

const term = currentTermKey();
const nextTerm = String(Number(term) + 1);
const seat = (cargoId: string | null, key = term) => ({
  positions: { [key]: { cargoId, comisionIds: [] } },
});

describe("memberProvisionBlocked", () => {
  it("does not block a clean, unseated member", () => {
    expect(memberProvisionBlocked(member(), catalog, false)).toBe(false);
  });

  it("does not block a member seated on a grant-free cargo", () => {
    // The control for the cargo clause: being seated is not the refusal, conferring power is.
    expect(memberProvisionBlocked(member(seat(PLAIN)), catalog, false)).toBe(false);
  });

  it("does not block a member whose only term entry has a null cargo", () => {
    expect(memberProvisionBlocked(member(seat(null)), catalog, false)).toBe(false);
  });

  it("blocks a member who already has a login (beacon's adoption guard)", () => {
    expect(memberProvisionBlocked(member({ uid: "u1" }), catalog, false)).toBe(true);
  });

  it("treats an empty-string uid as no login", () => {
    // A stored empty string is not a linked account; blocking on it would hide the invite for
    // exactly the member who still needs one.
    expect(memberProvisionBlocked(member({ uid: "" }), catalog, false)).toBe(false);
  });

  it("blocks a member carrying direct roleIds", () => {
    expect(memberProvisionBlocked(member({ roleIds: ["custom"] }), catalog, false)).toBe(true);
  });

  it("does not block on an empty roleIds array", () => {
    expect(memberProvisionBlocked(member({ roleIds: [] }), catalog, false)).toBe(false);
  });

  it("blocks a member carrying a permissionOverrides GRANT", () => {
    expect(
      memberProvisionBlocked(
        member({ permissionOverrides: { grant: ["update:Member"], revoke: [] } }),
        catalog,
        false,
      ),
    ).toBe(true);
  });

  // Deliberate mirror of beacon's hasDirectGrants, which checks `grant` only: a revoke-only
  // override mints nothing, so it is not a reason to withhold the invite. Widening this to
  // "has any override" would silently take the affordance away from a delegate for a member
  // who has strictly FEWER permissions than the default.
  it("BLOCKING: does NOT block on a revoke-only override — it mints nothing", () => {
    expect(
      memberProvisionBlocked(
        member({ permissionOverrides: { grant: [], revoke: ["update:Member"] } }),
        catalog,
        false,
      ),
    ).toBe(false);
  });

  it("blocks a member seated on a power-granting cargo in the CURRENT term", () => {
    expect(memberProvisionBlocked(member(seat(POWER)), catalog, false)).toBe(true);
  });

  // syncMemberClaims reads the current term at trigger time, so a future-term seat mints on
  // the year rollover. Reading only the current term here would offer the invite today and
  // 403 on it — beacon reads every term.
  it("BLOCKING: blocks a power-granting cargo seated in a FUTURE term", () => {
    expect(memberProvisionBlocked(member(seat(POWER, nextTerm)), catalog, false)).toBe(true);
  });

  it("blocks a power-granting cargo seated in a PAST term", () => {
    expect(memberProvisionBlocked(member(seat(POWER, "2020")), catalog, false)).toBe(true);
  });

  // Fails CLOSED in the same direction as beacon, which reads grants === null from an
  // unreadable cargo the same way. A stale or still-loading `positions` prop must hide the
  // affordance rather than promise a 403.
  it("BLOCKING: blocks when the cargo id does not resolve against the catalog", () => {
    expect(memberProvisionBlocked(member(seat("gone")), catalog, false)).toBe(true);
    expect(memberProvisionBlocked(member(seat(PLAIN)), () => undefined, false)).toBe(true);
  });

  it("blocks when any ONE term is power-granting among several clean ones", () => {
    const m = member({
      positions: {
        "2024": { cargoId: PLAIN, comisionIds: [] },
        [term]: { cargoId: POWER, comisionIds: [] },
        [nextTerm]: { cargoId: null, comisionIds: [] },
      },
    });
    expect(memberProvisionBlocked(m, catalog, false)).toBe(true);
  });

  // BLOCKING: an EMPTY-STRING cargoId is a MALFORMED seat, not an empty one. This mirrors
  // beacon's readCargoIds, which pushes "" rather than skipping it — "a malformed shape must
  // never read as 'no cargo', that is the guard's own bypass" — and then refuses it at
  // isSafeDocId. The gate used to test `term.cargoId ? [...] : []`, so "" read as "no cargo"
  // here: the invite was offered, the click 403'd with power-seat-requires-admin, and the
  // message named a cargo that does not exist. Now only undefined/null are skipped, so ""
  // falls through to the unresolvable-cargo clause and blocks — same direction as beacon.
  it("BLOCKING: blocks an EMPTY-STRING cargoId instead of reading it as no cargo", () => {
    expect(memberProvisionBlocked(member(seat("")), catalog, false)).toBe(true);
    // It blocks THROUGH the unresolvable-cargo clause, not through a clause of its own: no
    // Firestore document id can be "", so every CargoLookup answers undefined for it. Pinned
    // as the mechanism because that is the whole fix — "" was being dropped before it ever
    // reached the lookup, and there is no other clause standing behind it.
    expect(memberProvisionBlocked(member(seat("gone")), catalog, false)).toBe(true);
  });

  // The `undefined`/`null` half of that same change, so the fix cannot be over-applied into
  // "any falsy cargoId blocks". A term row with no cargo is the ordinary shape of an unseated
  // member and readCargoIds `continue`s past both — blocking here would hide the invite from
  // nearly every member in the chapter.
  // The `undefined` arm of the same guard is not exercised here on purpose: TermPositions
  // declares `cargoId` as required (`string | null`), so an absent key is unrepresentable in a
  // well-typed doc and asserting it would need a cast. It is kept in the gate as a read-side
  // defence — Firestore hands back whatever is stored — not as a reachable branch.
  it("BLOCKING: still skips a NULL cargoId, which is a genuinely unseated term", () => {
    expect(memberProvisionBlocked(member(seat(null)), catalog, false)).toBe(false);
  });

  // The callerIsAdmin short-circuit, which replaced a `!isAdmin &&` conjunct re-typed at three
  // call sites. Every refusal beacon applies is guarded by `!callerHoldsAdminRole`, so an Admin
  // is subject to none of them. Swept over every blocking fixture above rather than sampled:
  // the parameter is a single early return, so a regression that dropped it would show up on
  // whichever refusal a sampled test happened not to cover.
  it("BLOCKING: never blocks an Admin caller, on any refusal", () => {
    const blocked: Member[] = [
      member({ uid: "u1" }),
      member({ roleIds: ["custom"] }),
      member({ permissionOverrides: { grant: ["update:Member"], revoke: [] } }),
      member(seat(POWER)),
      member(seat(POWER, nextTerm)),
      member(seat("gone")),
      member(seat("")),
    ];
    for (const m of blocked) {
      expect(memberProvisionBlocked(m, catalog, false)).toBe(true);
      expect(memberProvisionBlocked(m, catalog, true)).toBe(false);
    }
  });
});

describe("draftProvisionBlocked", () => {
  it("does not block a draft with no cargo", () => {
    expect(draftProvisionBlocked(null, catalog, false)).toBe(false);
    expect(draftProvisionBlocked(undefined, catalog, false)).toBe(false);
  });

  // Deliberately NOT the member variant's answer, and pinned so the difference is a decision
  // rather than a leftover. `memberProvisionBlocked` reads a STORED doc, where a malformed ""
  // is reachable and must fail closed; this reads the draft the invite drawer is about to
  // create, whose cargoId comes from `z.string().min(1).nullable()` — "" cannot be produced,
  // and the create lane forbids a non-Admin the uid/roleIds/overrides halves anyway. If the
  // draft schema ever stops guaranteeing that, this line is the one that has to move.
  it("reads an empty-string draft cargoId as no cargo — the schema cannot produce one", () => {
    expect(draftProvisionBlocked("", catalog, false)).toBe(false);
  });

  it("does not block a draft seated on a grant-free cargo", () => {
    expect(draftProvisionBlocked(PLAIN, catalog, false)).toBe(false);
  });

  it("blocks a draft seated on a power-granting cargo", () => {
    expect(draftProvisionBlocked(POWER, catalog, false)).toBe(true);
  });

  it("BLOCKING: fails closed on a cargo id the catalog cannot resolve", () => {
    expect(draftProvisionBlocked("gone", catalog, false)).toBe(true);
  });

  // Same short-circuit as the member variant, and the reason the invite drawer no longer types
  // `!isAdmin &&` at its call site. Without it an Admin creating a board member would be told
  // "solo un administrador puede enviarle el acceso" — copy that contradicts itself.
  it("BLOCKING: never blocks an Admin caller, on either refusal", () => {
    expect(draftProvisionBlocked(POWER, catalog, true)).toBe(false);
    expect(draftProvisionBlocked("gone", catalog, true)).toBe(false);
  });
});
