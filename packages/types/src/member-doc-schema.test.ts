import { describe, it, expect } from "vitest";
import { memberDocSchema } from "./member-doc-schema";
import { fakeTimestamp, without } from "./doc-schema-test-helpers.js";

const validDoc = {
  name: "Ana Pérez",
  email: "ana@example.com",
  phone: "77712345",
  profession: "Ingeniera",
  joinDate: fakeTimestamp,
  birthdate: fakeTimestamp,
  status: "Activo",
  profilePicture: "https://example.com/p.jpg",
  totalPoints: 42,
  isPastPresident: false,
  gender: "Femenino",
  positions: { "2026": { cargoId: "cargo-1", comisionIds: [] } },
  uid: "uid-1",
  roleIds: ["role-1"],
  permissionOverrides: { grant: [], revoke: [] },
  active: true,
  deletedAt: null,
};

describe("memberDocSchema", () => {
  it("parses a fully-valid doc and round-trips its fields", () => {
    const parsed = memberDocSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  // The whole invite feature is invisible without this: zod strips unknown keys, so a
  // memberDocSchema that does not KNOW about `invite` drops beacon's projection on every
  // read, and every operator surface renders "Sin invitar" for a member who has a live link.
  it("round-trips beacon's invite projection", () => {
    const invite = {
      status: "pending",
      kind: "initial",
      tokenHash: "a".repeat(64),
      issuedAt: fakeTimestamp,
      expiresAt: fakeTimestamp,
      issuedBy: "uid-admin",
      usedAt: null,
    };
    expect(memberDocSchema.parse({ ...validDoc, invite }).invite).toEqual(invite);
  });

  // BLOCKING: a projection this build does not understand must cost the BADGE, never the
  // MEMBER. beacon writing a fifth invite status during a staged rollout (functions deploy
  // before hosting) would otherwise fail the whole parse, and parseDocs drops that member out
  // of the roster, the CSV, the ranking and /me — while parseDoc throws on the detail route.
  it("keeps the member when the invite projection cannot be parsed", () => {
    const parsed = memberDocSchema.parse({
      ...validDoc,
      invite: { status: "some-future-status", kind: "initial", tokenHash: "x" },
    });
    expect(parsed.name).toBe("Ana Pérez");
    expect(parsed.invite).toBeUndefined();
  });

  // The entire pre-feature roster. `memberInviteState` derives "legacy" from `uid && !invite`
  // rather than backfilling, so an absent projection must PARSE, not drop the member.
  it("parses a member provisioned before invites existed", () => {
    expect(memberDocSchema.parse(without(validDoc, "invite")).invite).toBeUndefined();
  });

  // Structural, not a comment: swapping this READ schema's `name` for the write-side
  // memberName compiles and passes every other test, while silently dropping any member
  // whose stored name predates memberNameValid() out of parseDocs — and so out of the
  // roster, /me, the CSV and the ranking. This case fails if someone does that.
  it("parses a legacy name the write-side pattern would reject", () => {
    expect(memberDocSchema.parse({ ...validDoc, name: "Ana Rivas 2" }).name).toBe("Ana Rivas 2");
  });

  it("rejects a malformed doc (joinDate as ISO string instead of Timestamp)", () => {
    const malformed = { ...validDoc, joinDate: "2024-01-01" };
    expect(memberDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("defaults profilePicture to null when absent", () => {
    const parsed = memberDocSchema.parse(without(validDoc, "profilePicture"));
    expect(parsed.profilePicture).toBeNull();
  });

  it("defaults totalPoints to 0 when absent", () => {
    const parsed = memberDocSchema.parse(without(validDoc, "totalPoints"));
    expect(parsed.totalPoints).toBe(0);
  });

  it("strips unknown extra fields", () => {
    const parsed = memberDocSchema.parse({ ...validDoc, legacyField: "gone" });
    expect(parsed).not.toHaveProperty("legacyField");
  });

  it("parses a legacy positions slot missing comisionIds to []", () => {
    const parsed = memberDocSchema.parse({
      ...validDoc,
      positions: { "2025": { cargoId: "x" } },
    });
    expect(parsed.positions?.["2025"]?.comisionIds).toEqual([]);
  });

  it("rejects an unknown status", () => {
    const malformed = { ...validDoc, status: "Nope" };
    expect(memberDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("leaves gender undefined when absent (pre-K2 docs)", () => {
    const parsed = memberDocSchema.parse(without(validDoc, "gender"));
    expect(parsed.gender).toBeUndefined();
  });

  it("round-trips publicProfile so the consent toggle survives a read", () => {
    expect(memberDocSchema.parse({ ...validDoc, publicProfile: true }).publicProfile).toBe(true);
    expect(memberDocSchema.parse(without(validDoc, "publicProfile")).publicProfile).toBeUndefined();
  });
});
