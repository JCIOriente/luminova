import { describe, expect, it } from "vitest";
import {
  boliviaPhoneOptional,
  boliviaPhoneRequired,
  boliviaWhatsAppUrl,
  isBoliviaPhone,
  normalizeBoliviaPhone,
} from "./phone.js";

describe("isBoliviaPhone", () => {
  it("accepts exactly 8 digits", () => {
    expect(isBoliviaPhone("70012345")).toBe(true);
  });
  it("rejects fewer or more than 8 digits", () => {
    expect(isBoliviaPhone("7001234")).toBe(false);
    expect(isBoliviaPhone("700123456")).toBe(false);
  });
  it("rejects a value with too few real digits", () => {
    expect(isBoliviaPhone("7001-345")).toBe(false); // 7 digits after stripping
  });
});

describe("normalizeBoliviaPhone", () => {
  it("strips spaces, dashes and parens", () => {
    expect(normalizeBoliviaPhone("7001-2345")).toBe("70012345");
    expect(normalizeBoliviaPhone(" 700 123 45 ")).toBe("70012345");
  });
  it("drops a leading Bolivia country code", () => {
    expect(normalizeBoliviaPhone("+591 700 00000")).toBe("70000000");
    expect(normalizeBoliviaPhone("59170012345")).toBe("70012345");
  });
  it("leaves a bare 8-digit number untouched", () => {
    expect(normalizeBoliviaPhone("70012345")).toBe("70012345");
  });
});

describe("boliviaPhoneRequired", () => {
  it("accepts 8 digits and returns them", () => {
    const r = boliviaPhoneRequired.safeParse("70012345");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("70012345");
  });
  it("normalizes a formatted / country-code value", () => {
    const r = boliviaPhoneRequired.safeParse("+591 700 00000");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("70000000");
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
  it("accepts and normalizes a provided value", () => {
    const r = boliviaPhoneOptional.safeParse("+591 700 00000");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("70000000");
  });
  it("rejects a wrong-length non-empty value", () => {
    expect(boliviaPhoneOptional.safeParse("123").success).toBe(false);
  });
});

describe("boliviaWhatsAppUrl", () => {
  it("builds a wa.me link with the 591 country code", () => {
    expect(boliviaWhatsAppUrl("70000000")).toBe("https://wa.me/59170000000");
  });
  it("normalizes formatting and a +591 prefix", () => {
    expect(boliviaWhatsAppUrl("+591 700 00000")).toBe("https://wa.me/59170000000");
  });
  it("encodes a prefilled text", () => {
    expect(boliviaWhatsAppUrl("70000000", "Hola JCI")).toBe(
      "https://wa.me/59170000000?text=Hola%20JCI",
    );
  });
  it("returns null for missing or invalid phones", () => {
    expect(boliviaWhatsAppUrl(undefined)).toBeNull();
    expect(boliviaWhatsAppUrl("")).toBeNull();
    expect(boliviaWhatsAppUrl("123")).toBeNull();
  });
});
