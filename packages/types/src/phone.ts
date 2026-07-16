import { z } from "zod";

/** Bolivia phone numbers are exactly 8 digits (mobiles start 6/7, landlines 2/3/4). */
export const BOLIVIA_PHONE_LENGTH = 8;
const BOLIVIA_PHONE_REGEX = new RegExp(`^\\d{${BOLIVIA_PHONE_LENGTH}}$`);
const DIGITS_MESSAGE = `El teléfono debe tener ${BOLIVIA_PHONE_LENGTH} dígitos.`;

/**
 * Reduce user-entered or legacy phone input to bare national digits: strip spaces,
 * dashes, parens, and a leading Bolivia country code (591) when present. This lets a
 * formatted or `+591`-prefixed value (typed, pasted, or already stored) normalize to
 * the 8-digit form instead of failing validation — e.g. "+591 700 00000" → "70000000".
 */
export function normalizeBoliviaPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === BOLIVIA_PHONE_LENGTH + 3 && digits.startsWith("591")
    ? digits.slice(3)
    : digits;
}

export function isBoliviaPhone(value: string): boolean {
  return BOLIVIA_PHONE_REGEX.test(normalizeBoliviaPhone(value));
}

/**
 * Build a wa.me chat link for a Bolivia phone (country code 591), optionally
 * pre-filling `text`. Returns null when the phone is missing/invalid so callers
 * can hide or disable the action instead of linking to a broken chat.
 */
export function boliviaWhatsAppUrl(value: string | undefined, text?: string): string | null {
  if (!value || !isBoliviaPhone(value)) return null;
  const base = `https://wa.me/591${normalizeBoliviaPhone(value)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Required phone: normalizes formatting/country code, then requires 8 digits (empty → "Requerido."). */
export const boliviaPhoneRequired = z
  .string()
  .transform(normalizeBoliviaPhone)
  .refine((v) => v.length > 0, "Requerido.")
  .refine((v) => BOLIVIA_PHONE_REGEX.test(v), DIGITS_MESSAGE);

/** Optional phone: blank allowed; a provided value is normalized then must be 8 digits. */
export const boliviaPhoneOptional = z
  .string()
  .transform(normalizeBoliviaPhone)
  .refine((v) => v === "" || BOLIVIA_PHONE_REGEX.test(v), DIGITS_MESSAGE)
  .optional();
