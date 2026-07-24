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
