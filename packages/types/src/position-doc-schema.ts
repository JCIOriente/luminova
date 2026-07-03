import { z } from "zod";
import { clientTimestampSchema } from "./client-timestamp-schema.js";
import { POSITION_CATEGORIES } from "./position.js";
import type { Position, TermPositions } from "./position.js";
import { ROLES } from "./permission-role.js";

export const termPositionsDocSchema = z.object({
  cargoId: z.string().nullable(),
  comisionIds: z.array(z.string()).default([]),
  assignedBy: z.string().optional(),
}) satisfies z.ZodType<TermPositions>;

export const positionDocSchema = z.object({
  title: z.string(),
  titleFemale: z.string().nullable().optional(),
  sigla: z.string().nullable().optional(),
  category: z.enum(POSITION_CATEGORIES),
  grants: z.array(z.enum(ROLES)),
  term: z.number().nullable(),
  description: z.string(),
  active: z.boolean(),
  deletedAt: clientTimestampSchema.nullable(),
}) satisfies z.ZodType<Omit<Position, "id">>;
