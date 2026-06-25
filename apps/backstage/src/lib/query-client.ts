import { QueryCache, QueryClient } from "@tanstack/react-query";
import { isPermissionDenied } from "./firestore-errors";

// Central chokepoint: every query failure passes through here. A permission-denied (rules
// rejected the read because the token lacks the required `perms` claim) otherwise surfaces
// as a generic "No se pudieron cargar …". Emit a self-diagnosing hint in development so the
// cause is obvious instead of a silent blank page; production stays quiet.
const queryCache = new QueryCache({
  onError: (error) => {
    if (import.meta.env.DEV && isPermissionDenied(error)) {
      console.warn(
        "[backstage] Firestore read denied (permission-denied): your ID token likely lacks " +
          "the required `perms` claim. After a claims or rules change, sign out and back in " +
          "to refresh the token.",
      );
    }
  },
});

export const queryClient = new QueryClient({ queryCache });
