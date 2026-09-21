import { z } from "zod";
import { clientTimestampSchema } from "./client-timestamp-schema.js";
import { MEMBER_STATUSES, MEMBER_GENDERS } from "./member.js";
import type { Member } from "./member.js";
import { termPositionsDocSchema } from "./position-doc-schema.js";
import { permissionOverridesSchema } from "./permission-overrides-schema.js";

/** Beacon's invite projection. Read-only from the client's side — every `firestore.rules`
 *  write lane denies `invite` — so this schema exists to stop zod STRIPPING the field on
 *  read, which would make every live link render as "Sin invitar". */
const memberInviteDocSchema = z.object({
  status: z.enum(["pending", "used", "revoked", "failed"]),
  kind: z.enum(["initial", "recovery"]),
  tokenHash: z.string(),
  issuedAt: clientTimestampSchema,
  expiresAt: clientTimestampSchema,
  issuedBy: z.string(),
  usedAt: clientTimestampSchema.nullable().default(null),
});

export const memberDocSchema = z.object({
  // Stays unbounded on purpose — do NOT mirror memberName's pattern here. This is the READ
  // path: a legacy doc whose name predates the pattern must still parse, or parseDocs drops
  // that member out of the roster, /me, the CSV and the ranking. Write-side bounds live in
  // memberSchema and firestore.rules.
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  profession: z.string().optional(),
  joinDate: clientTimestampSchema,
  birthdate: clientTimestampSchema,
  // .default so a doc predating the field parses instead of being dropped by parseDocs.
  // The public projection already treats an absent status as surfaceable; without this
  // default such a member could be live on the public Directiva while being invisible in
  // backstage — including to the Admin takedown action.
  status: z.enum(MEMBER_STATUSES).default("Activo"),
  profilePicture: z.string().nullable().default(null),
  totalPoints: z.number().default(0),
  isPastPresident: z.boolean().optional(),
  gender: z.enum(MEMBER_GENDERS).optional(),
  publicProfile: z.boolean().optional(),
  positions: z.record(z.string(), termPositionsDocSchema).optional(),
  uid: z.string().optional(),
  invite: memberInviteDocSchema.optional(),
  roleIds: z.array(z.string()).optional(),
  permissionOverrides: permissionOverridesSchema.optional(),
  active: z.boolean(),
  deletedAt: clientTimestampSchema.nullable(),
}) satisfies z.ZodType<Omit<Member, "id">>;
