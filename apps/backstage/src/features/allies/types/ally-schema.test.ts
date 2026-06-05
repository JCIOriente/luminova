import { describe, it, expect } from "vitest";
import { allySchema } from "./ally-schema";

const valid = {
  companyName: "Acme Bolivia",
  personInCharge: "Ana Pérez",
  phone: "777",
  email: "contacto@acme.bo",
};

describe("allySchema", () => {
  it("accepts a valid ally", () => {
    expect(allySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a short companyName", () => {
    expect(allySchema.safeParse({ ...valid, companyName: "AB" }).success).toBe(false);
  });

  it("rejects a short personInCharge", () => {
    expect(allySchema.safeParse({ ...valid, personInCharge: "An" }).success).toBe(false);
  });

  it("rejects an empty phone", () => {
    expect(allySchema.safeParse({ ...valid, phone: "" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(allySchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });
});
