import { z } from "zod";
import { PARTICIPATION_ROLES } from "./participation.js";

/** Ids flow into a composite doc id (`activityId__memberId__role`); `/` and `__`
 *  would traverse paths or collide ids, so reject them. */
const cleanId = z
  .string()
  .min(1)
  .refine((v) => !v.includes("/") && !v.includes("__"), "Id inválido.");

/** Validates the client-controlled fields of a check-in write. `checkInAt` is
 *  set server-side (`serverTimestamp()`) and is not part of this schema. */
export const checkInSchema = z.object({
  memberId: cleanId,
  activityId: cleanId,
  role: z.enum(PARTICIPATION_ROLES),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
