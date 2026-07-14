import { describe, it, expect } from "vitest";
import { allySchema } from "./ally-schema";

const valid = {
  companyName: "Acme Bolivia",
  contactPerson: "Ana Pérez",
  phone: "70012345",
  email: "contacto@acme.bo",
};

describe("allySchema", () => {
  it("accepts a valid ally", () => {
    expect(allySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a short companyName", () => {
    expect(allySchema.safeParse({ ...valid, companyName: "AB" }).success).toBe(false);
  });

  it("rejects a short contactPerson", () => {
    expect(allySchema.safeParse({ ...valid, contactPerson: "An" }).success).toBe(false);
  });

  it("rejects an empty phone", () => {
    expect(allySchema.safeParse({ ...valid, phone: "" }).success).toBe(false);
  });

  it("rejects a phone that is not 8 digits", () => {
    expect(allySchema.safeParse({ ...valid, phone: "777" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(allySchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });

  it("accepts a valid category", () => {
    expect(allySchema.safeParse({ ...valid, category: "University" }).success).toBe(true);
  });

  it("rejects an unknown category", () => {
    expect(allySchema.safeParse({ ...valid, category: "Nope" }).success).toBe(false);
  });

  it("allows category to be omitted", () => {
    expect(allySchema.safeParse(valid).success).toBe(true);
  });
});
