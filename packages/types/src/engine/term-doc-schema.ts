import { z } from "zod";
import { timestampSchema } from "./timestamp-schema.js";
import { TERM_STATUSES } from "./term.js";
import type { Term } from "./term.js";

export const termDocSchema = z.object({
  label: z.string().optional(),
  board: z.array(
    z.object({
      memberId: z.string(),
      title: z.string(),
      isExecutiveCommittee: z.boolean(),
    }),
  ),
  conventionDate: timestampSchema.nullable(),
  pointsCutoffAt: timestampSchema.nullable(),
  bestMemberId: z.string().nullable(),
  status: z.enum(TERM_STATUSES),
}) satisfies z.ZodType<Omit<Term, "id">>;
