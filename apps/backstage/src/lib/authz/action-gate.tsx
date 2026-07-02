import type { ReactNode } from "react";
import type { Role } from "@luminova/auth/roles";
import { useCan } from "./use-can";

type GateProps = {
  /** Role gate — caller holds at least one of these. Perm gates use the CASL
   *  `<Can I a>` component instead; this fills the gap for the role-based rules
   *  (Admin / ExecutiveCommittee / ProjectManager) that no perm expresses. */
  role?: readonly Role[];
  /** Arbitrary precondition, ANDed with the role gate. */
  when?: boolean;
  /** Rendered when the caller is NOT allowed (default: nothing). */
  fallback?: ReactNode;
  children: ReactNode;
};

/** Renders `children` only when the caller may perform the action — the
 *  declarative "hide the control they can never use". Gates are ANDed. */
export function ActionGate({ role, when, fallback = null, children }: GateProps) {
  const gate = useCan();
  const allowed = (!role || gate.hasRole(role)) && (when ?? true);
  return <>{allowed ? children : fallback}</>;
}
