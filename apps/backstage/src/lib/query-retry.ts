import { isPermissionDenied } from "./firestore-errors";
import { DocParseError } from "./firestore-read";

/**
 * TanStack Query `retry` predicate for the admin app. A `permission-denied` rules
 * rejection and a malformed-doc `DocParseError` are deterministic — retrying only
 * adds latency before the inevitable error. Genuine transient errors get one retry.
 *
 * `failureCount` is 0 on the first failure (query-core increments it after this
 * check), so `< 1` means exactly one retry / two total attempts.
 */
export function retryQuery(failureCount: number, error: unknown): boolean {
  if (isPermissionDenied(error)) return false;
  if (error instanceof DocParseError) return false;
  return failureCount < 1;
}
