import { describe, it, expect } from "vitest";
import { memberDocSchema } from "./member-doc-schema";

const ts = { toMillis: () => 0, toDate: () => new Date(0) };

const validDoc = {
  name: "Ana Pérez",
  email: "ana@example.com",
  phone: "77712345",
  profession: "Ingeniera",
  joinDate: ts,
  birthdate: ts,
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
    const rest: Partial<typeof validDoc> = { ...validDoc };
    delete rest.profilePicture;
    const parsed = memberDocSchema.parse(rest);
    expect(parsed.profilePicture).toBeNull();
  });

  it("defaults totalPoints to 0 when absent", () => {
    const rest: Partial<typeof validDoc> = { ...validDoc };
    delete rest.totalPoints;
    const parsed = memberDocSchema.parse(rest);
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
    const rest: Partial<typeof validDoc> = { ...validDoc };
    delete rest.gender;
    const parsed = memberDocSchema.parse(rest);
    expect(parsed.gender).toBeUndefined();
  });
});
