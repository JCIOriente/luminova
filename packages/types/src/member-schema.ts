import { z } from "zod";
import { MEMBER_STATUSES, MEMBER_GENDERS } from "./member.js";
import { boliviaPhoneOptional } from "./phone.js";
import { memberName, memberNameOrUnchanged } from "./member-name.js";
import {
  MEMBER_BIO_MAX,
  PROFESSION_MAX_LENGTH,
  isLinkedinProfileUrl,
} from "./engine/member-public.js";

const dateString = z
  .string()
  .min(1, "Requerido.")
  .refine((value) => {
    // Parse as UTC midnight and reject overflow dates (e.g. 2024-02-30 → 03-01).
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "Fecha inválida.");

export const memberSchema = z.object({
  name: memberName,
  email: z.string().trim().email("Correo inválido."),
  phone: boliviaPhoneOptional,
  gender: z.enum(MEMBER_GENDERS, { message: "Requerido." }),
  profession: z
    .string()
    .max(PROFESSION_MAX_LENGTH, `Máximo ${PROFESSION_MAX_LENGTH} caracteres.`)
    .optional(),
  joinDate: dateString,
  birthdate: dateString,
  status: z.enum(MEMBER_STATUSES),
  isPastPresident: z.boolean().optional(),
  cargoId: z.string().min(1).nullable(),
  comisionIds: z.array(z.string().min(1)),
});

export type MemberInput = z.infer<typeof memberSchema>;

/** What a member may change about themselves on /me. Mirrors the self lane in
 *  firestore.rules; the photo is its own action, not a form field. Email, status, cargo and
 *  joinDate are institutional records the membership tier maintains (the member owns their
 *  own name via the self lane).
 *  publicProfile controls appearing on the public Directiva (boardShowcase): opt-out for
 *  members created from 2026-08 on (beacon stamps the default), absent = not published on
 *  older docs. Only the member's own lane writes it; an Admin may force it off. */
export const selfProfileSchema = memberSchema
  .pick({
    name: true,
    phone: true,
    profession: true,
    birthdate: true,
  })
  .extend({
    publicProfile: z.boolean().optional(),
    bio: z.string().trim().max(MEMBER_BIO_MAX, `Máximo ${MEMBER_BIO_MAX} caracteres.`).optional(),
    linkedinUrl: z
      .string()
      .trim()
      // Share links carry tracking params the stored pattern refuses; only the path matters.
      .transform((value) => value.split(/[?#]/)[0] ?? "")
      .refine(
        (value) => value === "" || isLinkedinProfileUrl(value),
        "Usa un enlace como https://www.linkedin.com/in/tu-nombre",
      )
      .optional(),
  });

export type SelfProfileInput = z.infer<typeof selfProfileSchema>;

/** Edit-an-existing-member variants. They differ from the create schemas in one way: a name
 *  the user did not touch is not re-validated, mirroring `touched('name')` in firestore.rules
 *  so a member whose stored name predates that gate can still edit every other field.
 *  See memberNameOrUnchanged. */
export function memberSchemaFor(storedName: string) {
  return memberSchema.extend({ name: memberNameOrUnchanged(storedName) });
}

export function selfProfileSchemaFor(storedName: string) {
  return selfProfileSchema.extend({ name: memberNameOrUnchanged(storedName) });
}
