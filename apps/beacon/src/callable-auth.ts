import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

function callerRoles(request: CallableRequest): string[] {
  const token = request.auth?.token as { roles?: unknown } | undefined;
  return Array.isArray(token?.roles)
    ? (token.roles as unknown[]).filter((role): role is string => typeof role === "string")
    : [];
}

/** Reject anyone who isn't a signed-in Admin. Shared by every admin-only callable. */
export function requireAdmin(request: CallableRequest): void {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "sign-in required");
  }
  if (!callerRoles(request).includes("Admin")) {
    throw new HttpsError("permission-denied", "Admin role required");
  }
}
