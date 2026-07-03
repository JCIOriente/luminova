import { z } from "zod";
import { clientTimestampSchema } from "@luminova/types";
import { PARTICIPATION_ROLES } from "@luminova/types/engine";
import type { CheckInRecord } from "../roster";

/** Read projection of a checkIns doc. `checkInAt` is null in the brief window
 *  before a just-written row's serverTimestamp resolves. */
export const checkInRecordDocSchema = z.object({
  memberId: z.string(),
  role: z.enum(PARTICIPATION_ROLES),
  checkInAt: clientTimestampSchema.nullable().default(null),
}) satisfies z.ZodType<CheckInRecord>;
