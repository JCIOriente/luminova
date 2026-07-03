import { describe, it, expect } from "vitest";
import { allyDocSchema } from "./ally-doc-schema";

const ts = { toMillis: () => 0, toDate: () => new Date(0) };

const validDoc = {
  companyName: "Acme Bolivia",
  contactPerson: "Ana Pérez",
  phone: "777",
  email: "contacto@acme.bo",
  logoUrl: "https://example.com/logo.png",
  category: "University",
  active: true,
  deletedAt: null,
};

describe("allyDocSchema", () => {
  it("parses a fully-valid doc and round-trips its fields", () => {
    const parsed = allyDocSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  it("rejects a malformed doc (deletedAt as ISO string instead of Timestamp)", () => {
    const malformed = { ...validDoc, deletedAt: "2024-01-01" };
    expect(allyDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("defaults logoUrl to null when absent (pre-logo docs)", () => {
    const rest: Partial<typeof validDoc> = { ...validDoc };
    delete rest.logoUrl;
    const parsed = allyDocSchema.parse(rest);
    expect(parsed.logoUrl).toBeNull();
  });

  it("defaults category to null when absent (pre-category docs)", () => {
    const rest: Partial<typeof validDoc> = { ...validDoc };
    delete rest.category;
    const parsed = allyDocSchema.parse(rest);
    expect(parsed.category).toBeNull();
  });

  it("strips unknown extra fields", () => {
    const parsed = allyDocSchema.parse({ ...validDoc, legacyField: "gone" });
    expect(parsed).not.toHaveProperty("legacyField");
  });

  it("accepts deletedAt as a real Timestamp-like value", () => {
    const parsed = allyDocSchema.parse({ ...validDoc, deletedAt: ts });
    expect(parsed.deletedAt).toBe(ts);
  });

  it("rejects an unknown category", () => {
    const malformed = { ...validDoc, category: "Nope" };
    expect(allyDocSchema.safeParse(malformed).success).toBe(false);
  });
});
