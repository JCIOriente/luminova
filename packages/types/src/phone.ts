import { z } from "zod";

/** Bolivia phone numbers are exactly 8 digits (mobiles start 6/7, landlines 2/3/4). */
export const BOLIVIA_PHONE_LENGTH = 8;
const BOLIVIA_PHONE_REGEX = /^\d{8}$/;
const DIGITS_MESSAGE = "El teléfono debe tener 8 dígitos.";

export function isBoliviaPhone(value: string): boolean {
  return BOLIVIA_PHONE_REGEX.test(value);
}

/** Required 8-digit phone: empty → "Requerido.", wrong shape → digits message. */
export const boliviaPhoneRequired = z
  .string()
  .min(1, "Requerido.")
  .regex(BOLIVIA_PHONE_REGEX, DIGITS_MESSAGE);

/** Optional 8-digit phone: blank is allowed, otherwise must be 8 digits. */
export const boliviaPhoneOptional = z
  .union([z.literal(""), z.string().regex(BOLIVIA_PHONE_REGEX, DIGITS_MESSAGE)])
  .optional();
