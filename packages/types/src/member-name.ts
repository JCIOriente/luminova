import { z } from "zod";

/** Mirrored by memberNameValid() in firestore.rules — member-self-lane.rules.test.ts
 *  fails if the two drift, so a member never hits a cap the form let them exceed. */
export const MEMBER_NAME_MIN_LENGTH = 3;
export const MEMBER_NAME_MAX_LENGTH = 80;

/** ASCII letters, the Latin-1 letter block (À-Ö Ø-ö ø-ÿ skips × and ÷) for Spanish,
 *  Portuguese, Italian and German diacritics, and Latin Extended-A (Ā-ſ) for the Croatian,
 *  Polish, Czech and Turkish surnames the Santa Cruz chapter actually carries — Šimić,
 *  Matković, Łukasz. Literal ranges, NOT \p{L}: this exact string is handed to Firestore
 *  rules' matches(), where Unicode-class support is undocumented — the phone rule writes
 *  [0-9] rather than \d for the same reason. Non-Latin scripts are still out; widening
 *  again means the identical edit in firestore.rules, and the mirror test fails until both
 *  move together. */
const NAME_LETTERS = "A-Za-zÀ-ÖØ-öø-ÿĀ-ſ";

/**
 * One letter run with an optional trailing period (initials: "Ana M. Rivas"), then further
 * runs joined by a single space, hyphen or apostrophe ("Ana María Rivas-Paz",
 * "Jean-Luc O'Brien").
 *
 * Why bound a name at all: it is an identity field published to a world-readable page
 * (boardShowcase) and exported to CSV, so it needs a length ceiling it never had and a
 * character set that cannot carry markup or control characters. Digits, commas, quotes,
 * newlines and leading/trailing/doubled spaces are excluded; the first character is always
 * a letter. (CSV formula injection is handled at the output boundary in member-csv.ts —
 * this pattern makes a formula-shaped NAME unrepresentable, but it is not that defense.)
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
  return value
    .normalize("NFC")
    .replace(/[‘’ʼ´`′]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** The single message a normalized name fails on, or null. One function so `memberName` and
 *  `memberNameOrUnchanged` cannot report different reasons for the same value. */
function memberNameIssue(value: string): string | null {
  if (value.length < MEMBER_NAME_MIN_LENGTH) return `Mínimo ${MEMBER_NAME_MIN_LENGTH} caracteres.`;
  if (value.length > MEMBER_NAME_MAX_LENGTH) return `Máximo ${MEMBER_NAME_MAX_LENGTH} caracteres.`;
  if (!MEMBER_NAME_REGEX.test(value)) {
    return "Solo letras, espacios, puntos, guiones y apóstrofos.";
  }
  return null;
}

function addNameIssue(value: string, ctx: z.RefinementCtx): void {
  const message = memberNameIssue(value);
  if (message !== null) ctx.addIssue({ code: "custom", message });
}

/** A name being SET: normalized, then validated. Use for creating a member. */
export const memberName = z.string().transform(normalizeMemberName).superRefine(addNameIssue);

/**
 * A name on an EXISTING member: validated only when it differs from the one already stored.
 *
 * This is the client mirror of `touched('name')` in firestore.rules, and it is load-bearing,
 * not a nicety. Names predating memberNameValid() exist (the rules suite seeds `m_legacyname`
 * for exactly this), and React Hook Form validates the WHOLE schema on submit against
 * defaultValues seeded from the stored doc. Validating an untouched name would therefore
 * block every OTHER field on that member — phone, profession, birthdate, the publicProfile
 * consent toggle — on both /me and the admin form, making the server-side affordance
 * unreachable from the UI. An unchanged value is also skipped by normalization, so the form
 * submits the stored bytes and the rules see no diff at all.
 */
export function memberNameOrUnchanged(storedName: string) {
  return z
    .string()
    .transform((v) => (v === storedName ? v : normalizeMemberName(v)))
    .superRefine((v, ctx) => {
      if (v === storedName) return;
      addNameIssue(v, ctx);
    });
}
