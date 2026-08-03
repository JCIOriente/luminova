import { createContext, useContext, useMemo, type ReactNode } from "react";
import { AbilityProvider as CaslAbilityProvider, useAbility as useCaslAbility } from "@casl/react";
import { buildAbility, type Action, type AppAbility, type Subject } from "@luminova/auth/ability";
import type { AuthClaims } from "@luminova/auth/roles";
import { abilityAllows } from "./probe";

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

/** The decoded auth claims (roles/perms) mounted at __root.
 *  Rules gate some writes on the `roles` claim, not the coarse `perms` — the
 *  authz UI helpers need both. */
export function useClaims(): AuthClaims {
  return useContext(ClaimsContext);
}

interface CanProps {
  /** The action being offered. */
  I: Action;
  a: Subject;
  children: ReactNode;
}

/** Collection-level perm gate — "may this caller do X to this KIND of thing at all?".
 *  Deliberately NOT `@casl/react`'s `Can`: that one takes a subject TYPE, whose answer a
 *  conditional own-doc grant satisfies (see `abilityAllows`). There is no per-document
 *  form on purpose — the one honest way to ask about a specific document is
 *  `useCan().can(action, subject, fields)`, so a control can't accidentally be gated on
 *  somebody else's document. Role-based rules use `ActionGate` instead. */
export function Can({ I: action, a, children }: CanProps) {
  const ability = useAbility();
  // Memoized because a table renders this once per row: the answer only moves when the
  // ability itself does (@casl/react's Can cached the same way).
  const allowed = useMemo(() => abilityAllows(ability, action, a), [ability, action, a]);
  return <>{allowed ? children : null}</>;
}
