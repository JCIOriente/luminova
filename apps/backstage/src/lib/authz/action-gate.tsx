import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Tooltip } from "@luminova/ui";
import type { Action, Subject } from "@luminova/auth/ability";
import type { Role } from "@luminova/auth/roles";
import { useCan } from "./use-can";

type GateProps = {
  /** Perm gate — coarse `action:subject`. */
  can?: { action: Action; subject: Subject };
  /** Role gate — caller holds at least one of these. */
  role?: readonly Role[];
  /** Arbitrary precondition, ANDed with the above. */
  when?: boolean;
  /** Rendered when the caller is NOT allowed (default: nothing). */
  fallback?: ReactNode;
  children: ReactNode;
};

/** Renders `children` only when the caller may perform the action — the
 *  declarative "hide the control they can never use". All supplied gates are
 *  ANDed. Mirror the Firestore rule: use `can` for perm-gated writes and `role`
 *  for the Admin/ExecutiveCommittee/ProjectManager-gated ones. */
export function ActionGate({ can, role, when, fallback = null, children }: GateProps) {
  const gate = useCan();
  const allowed =
    (!can || gate.can(can.action, can.subject)) &&
    (!role || gate.hasRole(role)) &&
    (when ?? true);
  return <>{allowed ? children : fallback}</>;
}

type DisabledChild = ReactElement<{ disabled?: boolean; "aria-disabled"?: boolean }>;

/** Keeps a control visible but disabled when a *state* precondition blocks it
 *  (locked / closed / wrong-role-for-this-field), with a short reason — never a
 *  dead control that fails only on submit. Clones the single child to inject
 *  `disabled`; a hoverable wrapper carries the tooltip (disabled elements emit no
 *  pointer events). Pass `inline` to render the reason as text beneath instead. */
export function DisabledReason({
  when,
  reason,
  inline = false,
  side = "top",
  children,
}: {
  when: boolean;
  reason: string;
  inline?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  children: DisabledChild;
}) {
  if (!when) return <>{children}</>;
  const child = Children.only(children);
  const disabled = isValidElement(child)
    ? cloneElement(child, { disabled: true, "aria-disabled": true })
    : child;
  if (inline) {
    return (
      <div className="flex flex-col gap-1">
        {disabled}
        <span className="text-[12px] text-ink-3">{reason}</span>
      </div>
    );
  }
  return (
    <Tooltip content={reason} side={side}>
      <span className="inline-flex cursor-not-allowed">{disabled}</span>
    </Tooltip>
  );
}
