import { QueryCache, QueryClient } from "@tanstack/react-query";
import { isPermissionDenied } from "./firestore-errors";
import { DocParseError } from "./firestore-read";
import { retryQuery } from "./query-retry";

// Central chokepoint: every query failure passes through here. A permission-denied (rules
// rejected the read because the token lacks the required `perms` claim) otherwise surfaces
// as a generic "No se pudieron cargar …". Emit a self-diagnosing hint in development so the
// cause is obvious instead of a silent blank page; production stays quiet.
const queryCache = new QueryCache({
  onError: (error) => {
    // Mirror parseDocs' log shape for single-get parse failures — the thrown
    // DocParseError reaches the UI as a generic query error, so the zod issues
    // would otherwise be dropped here.
    if (error instanceof DocParseError) {
      console.error(`[backstage] Malformed ${error.collection} doc ${error.docId}`, error.issues);
      return;
    }
    if (import.meta.env.DEV && isPermissionDenied(error)) {
      console.warn(
        "[backstage] Firestore read denied (permission-denied): your ID token likely lacks " +
          "the required `perms` claim. After a claims or rules change, sign out and back in " +
          "to refresh the token.",
      );
    }
  },
});

// Admin-app defaults (audit item 10, docs/specs/2026-07-06-query-client-defaults-design.md).
// Reference data tolerates brief staleness; tab-refocus refetch storms add cost with no gain.
// Live screens (e.g. the check-in roster) opt back into freshness per-hook.
export const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: retryQuery,
    },
    // Firestore writes are non-idempotent — a retried check-in could double-write.
    mutations: { retry: false },
  },
});
