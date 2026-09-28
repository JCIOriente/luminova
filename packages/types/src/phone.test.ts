import { describe, expect, it } from "vitest";
import {
  boliviaPhoneOptional,
  boliviaPhoneRequired,
  boliviaWhatsAppUrl,
  isBoliviaPhone,
  normalizeBoliviaPhone,
  sanitizeBoliviaPhoneInput,
  BOLIVIA_PHONE_LENGTH,
  BOLIVIA_PHONE_PATTERN,
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
  it("rejects a number whose first digit no Bolivian line uses (0, 1, 5, 8, 9)", () => {
    for (const phone of ["01234567", "12345678", "51234567", "81234567", "91234567"]) {
      expect(isBoliviaPhone(phone)).toBe(false);
    }
  });
  it("accepts landline and mobile first digits at both edges (2 and 7)", () => {
    expect(isBoliviaPhone("20000000")).toBe(true);
    expect(isBoliviaPhone("79999999")).toBe(true);
  });
});

describe("BOLIVIA_PHONE_PATTERN", () => {
  // firestore.rules has no \d, so the pattern it mirrors byte-for-byte must not use one.
  it("is written with [0-9] classes only", () => {
    expect(BOLIVIA_PHONE_PATTERN).toBe("^[23467][0-9]{7}$");
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
    if (!r.success)
      expect(r.error.issues[0].message).toBe(
        "El teléfono debe tener 8 dígitos y empezar con 2, 3, 4, 6 o 7.",
      );
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

describe("sanitizeBoliviaPhoneInput", () => {
  // One sanitize per keystroke, feeding each result back in: how a field sees typed input.
  const typeInto = (keys: string) =>
    [...keys].reduce((value, key) => sanitizeBoliviaPhoneInput(value + key), "");

  it("strips a pasted 00591 international prefix instead of truncating it into the number", () => {
    expect(sanitizeBoliviaPhoneInput("00591 70012345")).toBe("70012345");
    expect(sanitizeBoliviaPhoneInput("0059170012345")).toBe("70012345");
  });
  it("strips 00591 typed one key at a time without freezing on the way", () => {
    expect(typeInto("0")).toBe("0");
    expect(typeInto("00")).toBe("00");
    expect(typeInto("005")).toBe("005");
    expect(typeInto("0059")).toBe("0059");
    expect(typeInto("00591")).toBe("00591");
    expect(typeInto("0059170012345")).toBe("70012345");
    expect(typeInto("00591 70012345")).toBe("70012345");
  });
  it("strips +591 typed one key at a time", () => {
    expect(typeInto("+59170012345")).toBe("70012345");
    expect(typeInto("+591 700 12345")).toBe("70012345");
  });
  it("still truncates genuinely over-long national input", () => {
    expect(typeInto("700123456")).toBe("70012345");
  });
  it("caps typed or pasted digits at the schema's length", () => {
    expect(sanitizeBoliviaPhoneInput("7001234567890")).toBe("70012345");
    expect(sanitizeBoliviaPhoneInput("7001234567890")).toHaveLength(BOLIVIA_PHONE_LENGTH);
  });
  it("strips everything that is not a digit", () => {
    expect(sanitizeBoliviaPhoneInput("700-12a 345")).toBe("70012345");
  });
  it("keeps a pasted +591 number whole instead of truncating the prefix", () => {
    expect(sanitizeBoliviaPhoneInput("+591 700 00000")).toBe("70000000");
  });
  it("drops the 591 prefix as soon as it pushes past 8 digits while typing", () => {
    expect(sanitizeBoliviaPhoneInput("591700")).toBe("591700");
    expect(sanitizeBoliviaPhoneInput("591700000")).toBe("700000");
  });
  it("leaves a short or empty value alone", () => {
    expect(sanitizeBoliviaPhoneInput("")).toBe("");
    expect(sanitizeBoliviaPhoneInput("700")).toBe("700");
  });
  it("always yields something the schema accepts once 8 digits are in", () => {
    for (const raw of ["+591 7000 0000 99", "(700) 000-00 123", "59170012345"]) {
      expect(isBoliviaPhone(sanitizeBoliviaPhoneInput(raw))).toBe(true);
    }
  });
});

describe("phone schemas reject a leading 0, 1 or 5", () => {
  it("required: names the first-digit rule", () => {
    const r = boliviaPhoneRequired.safeParse("12345678");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe(
        "El teléfono debe tener 8 dígitos y empezar con 2, 3, 4, 6 o 7.",
      );
    }
  });
  it("optional: still rejects a provided 0/5-leading number", () => {
    expect(boliviaPhoneOptional.safeParse("01234567").success).toBe(false);
    expect(boliviaPhoneOptional.safeParse("51234567").success).toBe(false);
  });
});
