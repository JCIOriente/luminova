import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  AbilityProvider as CaslAbilityProvider,
  Can as CaslCan,
  useAbility as useCaslAbility,
} from "@casl/react";
import { buildAbility, type AppAbility } from "@luminova/auth/ability";
import type { AuthClaims } from "@luminova/auth/roles";

const EMPTY_CLAIMS: AuthClaims = { roles: [] };
const ClaimsContext = createContext<AuthClaims>(EMPTY_CLAIMS);

export function AbilityProvider({
  claims,
  uid,
  children,
}: {
  claims: AuthClaims;
  uid: string;
  children: ReactNode;
}) {
  const ability = useMemo(() => buildAbility(claims, uid), [claims, uid]);
  return (
    <ClaimsContext.Provider value={claims}>
      <CaslAbilityProvider value={ability}>{children}</CaslAbilityProvider>
    </ClaimsContext.Provider>
  );
}

export function useAbility(): AppAbility {
  return useCaslAbility<AppAbility>();
}

/** The decoded auth claims (roles/perms/scannerEventIds) mounted at __root.
 *  Rules gate some writes on the `roles` claim, not the coarse `perms` — the
 *  authz UI helpers need both. */
export function useClaims(): AuthClaims {
  return useContext(ClaimsContext);
}

export const Can = CaslCan;
