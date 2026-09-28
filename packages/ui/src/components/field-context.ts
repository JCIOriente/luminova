import { createContext, useContext } from "react";

interface FieldAria {
  /** Id of whichever of the hint or the error Field is actually rendering. */
  describedById?: string;
  invalid: boolean;
  required: boolean;
}

export const FieldContext = createContext<FieldAria | null>(null);

type AriaBool = boolean | "true" | "false";

interface ControlAria {
  "aria-describedby"?: string;
  "aria-invalid"?: AriaBool | "grammar" | "spelling";
  "aria-required"?: AriaBool;
}

function mergeIds(own: string | undefined, fromField: string | undefined): string | undefined {
  // Deduped: a form that still wires `${id}-err` by hand must not have it announced twice.
  const ids = new Set(`${own ?? ""} ${fromField ?? ""}`.split(/\s+/).filter(Boolean));
  return ids.size > 0 ? [...ids].join(" ") : undefined;
}

/** The aria a text control inside a Field owes: described by the hint/error on screen, invalid
 *  while an error shows, required when the label carries the asterisk. The caller's own
 *  describedby is kept (a form's note stays first) and an explicit aria-invalid wins, so a form
 *  that gates errors on its own terms (site-config's `attempted`) stays authoritative. */
export function useFieldControlAria(own: ControlAria): ControlAria {
  const field = useContext(FieldContext);
  if (!field) return own;
  return {
    "aria-describedby": mergeIds(own["aria-describedby"], field.describedById),
    "aria-invalid": own["aria-invalid"] ?? (field.invalid ? true : undefined),
    "aria-required": own["aria-required"] ?? (field.required ? true : undefined),
  };
}

/** For a button-rendered picker trigger: describedby only. aria-invalid and aria-required are
 *  not supported on role=button, so they would be announced inconsistently or not at all. */
export function useFieldTriggerDescribedBy(own: string | undefined): string | undefined {
  const field = useContext(FieldContext);
  return field ? mergeIds(own, field.describedById) : own;
}
