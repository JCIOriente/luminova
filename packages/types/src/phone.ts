import { z } from "zod";

/** Bolivia phone numbers are exactly 8 digits (mobiles start 6/7, landlines 2/3/4). */
export const BOLIVIA_PHONE_LENGTH = 8;
/** Mirrored byte-for-byte by selfProfileValid() in firestore.rules, which has no `\d`, so
 *  this is written with `[0-9]`. member-self-lane.rules.test.ts fails if the two drift. */
export const BOLIVIA_PHONE_PATTERN = `^[23467][0-9]{${BOLIVIA_PHONE_LENGTH - 1}}$`;
const BOLIVIA_PHONE_REGEX = new RegExp(BOLIVIA_PHONE_PATTERN);
/** Placeholder for a phone input, derived so it cannot disagree with the length. */
export const BOLIVIA_PHONE_PLACEHOLDER = `${BOLIVIA_PHONE_LENGTH} dígitos`;
const DIGITS_MESSAGE = `El teléfono debe tener ${BOLIVIA_PHONE_LENGTH} dígitos y empezar con 2, 3, 4, 6 o 7.`;

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

/**
 * What a phone field may hold while the user is still typing or pasting: digits only, never
 * more than BOLIVIA_PHONE_LENGTH. Input-time companion to normalizeBoliviaPhone, which stays
 * the submit-time backstop.
 *
 * A leading country code ("+591", or the "00591" international-dial form) is dropped as soon
 * as the digits run past the national length. Waiting for a complete number instead would
 * break typing: keyed one digit at a time, the field would freeze at "59170000" or
 * "00591700". Dropping it is safe because no Bolivian national number starts with 0 or 5
 * (mobiles 6/7, landlines 2/3/4).
 */
export function sanitizeBoliviaPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  const national =
    digits.length > BOLIVIA_PHONE_LENGTH ? digits.replace(/^(?:00)?591/, "") : digits;
  return national.slice(0, BOLIVIA_PHONE_LENGTH);
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

/** Required phone: normalizes formatting/country code, then requires 8 digits starting 2, 3, 4, 6 or 7 (empty → "Requerido."). */
export const boliviaPhoneRequired = z
  .string()
  .transform(normalizeBoliviaPhone)
  .refine((v) => v.length > 0, "Requerido.")
  .refine((v) => BOLIVIA_PHONE_REGEX.test(v), DIGITS_MESSAGE);

/** Optional phone: blank allowed; a provided value is normalized then must be 8 digits starting 2, 3, 4, 6 or 7. */
export const boliviaPhoneOptional = z
  .string()
  .transform(normalizeBoliviaPhone)
  .refine((v) => v === "" || BOLIVIA_PHONE_REGEX.test(v), DIGITS_MESSAGE)
  .optional();
