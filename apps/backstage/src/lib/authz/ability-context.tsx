import { createContext, useContext, useMemo, type ReactNode } from "react";
import { AbilityProvider as CaslAbilityProvider, useAbility as useCaslAbility } from "@casl/react";
import { buildAbility, type Action, type AppAbility, type Subject } from "@luminova/auth/ability";
import type { AuthClaims } from "@luminova/auth/roles";
import { abilityAllows, type SubjectFields } from "./probe";

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

interface CanProps {
  /** The action being offered. */
  I: Action;
  a: Subject;
  /** Fields of the specific document this control acts on. Omit for a collection-level
   *  control (a toolbar button, a nav entry) — the gate then admits only unconditional
   *  grant holders, mirroring the rules' unscoped allow. */
  on?: SubjectFields;
  /** Invert the gate — render only when the caller may NOT do it. */
  not?: boolean;
  children: ReactNode;
}

/** Perm gate. Deliberately NOT `@casl/react`'s `Can`: that one takes a subject TYPE, whose
 *  answer a conditional own-doc grant satisfies. See `abilityAllows` for the full why.
 *  Role-based rules (Admin / ExecutiveCommittee) use `ActionGate` instead. */
export function Can({ I: action, a, on, not = false, children }: CanProps) {
  const ability = useAbility();
  const allowed = abilityAllows(ability, action, a, on);
  return <>{allowed !== not ? children : null}</>;
}
