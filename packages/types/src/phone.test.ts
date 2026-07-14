import { describe, expect, it } from "vitest";
import { boliviaPhoneOptional, boliviaPhoneRequired, isBoliviaPhone } from "./phone.js";

describe("isBoliviaPhone", () => {
  it("accepts exactly 8 digits", () => {
    expect(isBoliviaPhone("70012345")).toBe(true);
  });
  it("rejects fewer or more than 8 digits", () => {
    expect(isBoliviaPhone("7001234")).toBe(false);
    expect(isBoliviaPhone("700123456")).toBe(false);
  });
  it("rejects non-digits", () => {
    expect(isBoliviaPhone("7001-345")).toBe(false);
    expect(isBoliviaPhone("+59170012345")).toBe(false);
  });
});

describe("boliviaPhoneRequired", () => {
  it("accepts 8 digits", () => {
    expect(boliviaPhoneRequired.safeParse("70012345").success).toBe(true);
  });
  it("reports Requerido on empty", () => {
    const r = boliviaPhoneRequired.safeParse("");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Requerido.");
  });
  it("reports the digits message on wrong length", () => {
    const r = boliviaPhoneRequired.safeParse("123");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("El teléfono debe tener 8 dígitos.");
  });
});

describe("boliviaPhoneOptional", () => {
  it("accepts undefined (omitted)", () => {
    expect(boliviaPhoneOptional.safeParse(undefined).success).toBe(true);
  });
  it("accepts an empty string (blank field)", () => {
    expect(boliviaPhoneOptional.safeParse("").success).toBe(true);
  });
  it("accepts 8 digits", () => {
    expect(boliviaPhoneOptional.safeParse("70012345").success).toBe(true);
  });
  it("rejects a wrong-length non-empty value", () => {
    expect(boliviaPhoneOptional.safeParse("123").success).toBe(false);
  });
});
