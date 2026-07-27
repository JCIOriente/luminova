import { z } from "zod";

/** Mirrored by selfProfileValid() in firestore.rules — member-self-lane.rules.test.ts
 *  fails if the two drift, so a member never hits a cap the form let them exceed. */
export const MEMBER_NAME_MIN_LENGTH = 3;
export const MEMBER_NAME_MAX_LENGTH = 80;

/** ASCII letters plus the Latin-1 letter block (À-Ö Ø-ö ø-ÿ skips × and ÷), which covers
 *  Spanish, Portuguese, Italian and German diacritics. Literal ranges, NOT \p{L}: this
 *  exact string is handed to Firestore rules' matches(), where Unicode-class support is
 *  undocumented — the phone rule writes [0-9] rather than \d for the same reason.
 *  Widening this (e.g. Latin Extended-A for Croatian/Polish surnames) means the identical
 *  edit in firestore.rules; the mirror test fails until both move together. */
const NAME_LETTERS = "A-Za-zÀ-ÖØ-öø-ÿ";

/**
 * One letter run with an optional trailing period (initials: "Ana M. Rivas"), then further
 * runs joined by a single space, hyphen or apostrophe ("Ana María Rivas-Paz",
 * "Jean-Luc O'Brien").
 *
 * The consequence is the point, not a side effect: the first character is always a letter,
 * so a name can never begin with =, +, -, @, tab or CR. A member name therefore cannot
 * represent a spreadsheet formula, which is why the members CSV export validates at the
 * source instead of escaping at write time (apps/backstage/.../lib/member-csv.ts). Digits,
 * commas, quotes, newlines and leading/trailing/doubled spaces are excluded too.
 *
 * Contains no backslashes by construction — hyphen last inside [ '-], [.] for a literal
 * period — which is what makes it safe to paste verbatim into a rules string literal.
 */
export const MEMBER_NAME_PATTERN = `^[${NAME_LETTERS}]+[.]?(?:[ '-][${NAME_LETTERS}]+[.]?)*$`;

const MEMBER_NAME_REGEX = new RegExp(MEMBER_NAME_PATTERN);

/**
 * Reduce what a real keyboard produces to the canonical form the pattern accepts: compose
 * accents (iOS and macOS emit NFD — "n" + U+0303 — whose combining mark is not a letter),
 * fold the typographic apostrophe autocorrect inserts, collapse whitespace runs (\s covers
 * the non-breaking space a paste from Word carries), trim. Same normalize-then-validate
 * shape as normalizeBoliviaPhone.
 *
 * firestore.rules has no normalizer — it sees only what the form already cleaned — so the
 * raw forms repaired here are denied server-side by design.
 */
function normalizeMemberName(value: string): string {
  return value.normalize("NFC").replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim();
}

export const memberName = z
  .string()
  .transform(normalizeMemberName)
  .refine((v) => v.length >= MEMBER_NAME_MIN_LENGTH, `Mínimo ${MEMBER_NAME_MIN_LENGTH} caracteres.`)
  .refine((v) => v.length <= MEMBER_NAME_MAX_LENGTH, `Máximo ${MEMBER_NAME_MAX_LENGTH} caracteres.`)
  .refine((v) => MEMBER_NAME_REGEX.test(v), "Solo letras, espacios, guiones y apóstrofos.");
