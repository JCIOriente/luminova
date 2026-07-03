import { z } from "zod";
import type { Timestamp } from "firebase/firestore";
import { isTimestampLike } from "./engine/timestamp-schema.js";

/** Client-SDK-typed variant for the non-engine entities (Member, Ally, …) whose
 *  fields are declared as `firebase/firestore` Timestamps. The runtime check is
 *  structural; backstage doc data always carries real client Timestamp instances. */
export const clientTimestampSchema = z.custom<Timestamp>(isTimestampLike);
