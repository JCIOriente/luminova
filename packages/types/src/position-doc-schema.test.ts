import { describe, it, expect } from "vitest";
import { positionDocSchema, termPositionsDocSchema } from "./position-doc-schema";
import { fakeTimestamp, without } from "./doc-schema-test-helpers.js";

const validDoc = {
  title: "Director de Membresía",
  titleFemale: "Directora de Membresía",
  sigla: null,
  category: "JDL",
  grants: ["Membership"],
  term: 2026,
  description: "Gestiona el ingreso de nuevos miembros.",
  active: true,
  deletedAt: null,
};

describe("positionDocSchema", () => {
  it("parses a fully-valid doc and round-trips its fields", () => {
    const parsed = positionDocSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  it("rejects a malformed doc (unknown category)", () => {
    const malformed = { ...validDoc, category: "Nope" };
    expect(positionDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects a malformed doc (ISO string instead of Timestamp for deletedAt)", () => {
    const malformed = { ...validDoc, deletedAt: "2026-01-01T00:00:00.000Z" };
    expect(positionDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects an unknown grants entry", () => {
    const malformed = { ...validDoc, grants: ["NotARole"] };
    expect(positionDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("strips unknown extra fields", () => {
    const parsed = positionDocSchema.parse({ ...validDoc, legacyField: "gone" });
    expect(parsed).not.toHaveProperty("legacyField");
  });

  it("accepts deletedAt as a real Timestamp-like value", () => {
    const parsed = positionDocSchema.parse({ ...validDoc, deletedAt: fakeTimestamp });
    expect(parsed.deletedAt).toBe(fakeTimestamp);
  });
});

describe("termPositionsDocSchema", () => {
  const validTermPositions = {
    cargoId: "cargo-1",
    comisionIds: ["com-1", "com-2"],
    assignedBy: "member-1",
  };

  it("parses a fully-valid term positions doc", () => {
    const parsed = termPositionsDocSchema.parse(validTermPositions);
    expect(parsed).toEqual(validTermPositions);
  });

  it("defaults comisionIds to [] when absent (legacy slot)", () => {
    const parsed = termPositionsDocSchema.parse(without(validTermPositions, "comisionIds"));
    expect(parsed.comisionIds).toEqual([]);
  });

  it("leaves assignedBy undefined when absent (pre-K4 docs)", () => {
    const parsed = termPositionsDocSchema.parse(without(validTermPositions, "assignedBy"));
    expect(parsed.assignedBy).toBeUndefined();
  });

  it("rejects a malformed doc (cargoId missing entirely)", () => {
    expect(termPositionsDocSchema.safeParse(without(validTermPositions, "cargoId")).success).toBe(
      false,
    );
  });

  it("strips unknown extra fields", () => {
    const parsed = termPositionsDocSchema.parse({ ...validTermPositions, legacyField: "gone" });
    expect(parsed).not.toHaveProperty("legacyField");
  });
});
