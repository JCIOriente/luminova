import { z } from "zod";
import type { Timestamp } from "./timestamp.js";

/** Structural Timestamp check — `@luminova/types` has no runtime firebase dep,
 *  so read-schemas can't `instanceof` either SDK's Timestamp class. */
export function isTimestampLike(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).toMillis === "function" &&
    typeof (value as Record<string, unknown>).toDate === "function"
  );
}

export const timestampSchema = z.custom<Timestamp>(isTimestampLike);
