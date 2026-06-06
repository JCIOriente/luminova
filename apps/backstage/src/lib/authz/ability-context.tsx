import { useMemo, type ReactNode } from "react";
import {
  AbilityProvider as CaslAbilityProvider,
  Can as CaslCan,
  useAbility as useCaslAbility,
} from "@casl/react";
import { buildAbility, type AppAbility } from "@luminova/auth/ability";
import type { AuthClaims } from "@luminova/auth/roles";

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
  return <CaslAbilityProvider value={ability}>{children}</CaslAbilityProvider>;
}

export function useAbility(): AppAbility {
  return useCaslAbility<AppAbility>();
}

export const Can = CaslCan;
