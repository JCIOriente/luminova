import { describe, it, expect } from "vitest";
import { fakeTimestamp } from "../doc-schema-test-helpers.js";
import { termDocSchema } from "./term-doc-schema";

const requiredDoc = {
  board: [{ memberId: "member-1", title: "Presidente", isExecutiveCommittee: true }],
  conventionDate: fakeTimestamp,
  pointsCutoffAt: fakeTimestamp,
  bestMemberId: "member-1",
  status: "Activo",
};

const validDoc = { ...requiredDoc, label: "Gestión 2026" };

describe("termDocSchema", () => {
  it("parses a fully-valid doc and round-trips its fields", () => {
    const parsed = termDocSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  it("rejects a malformed doc (ISO string instead of Timestamp)", () => {
    const malformed = { ...validDoc, conventionDate: "2026-01-01T00:00:00.000Z" };
    expect(termDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("allows label to be absent (optional, no default value)", () => {
    const parsed = termDocSchema.parse(requiredDoc);
    expect(parsed.label).toBeUndefined();
  });

  it("strips unknown extra fields", () => {
    const parsed = termDocSchema.parse({ ...validDoc, legacyField: "gone" });
    expect(parsed).not.toHaveProperty("legacyField");
  });
});
