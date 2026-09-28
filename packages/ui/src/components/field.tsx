import type { ReactNode } from "react";
import { Icon } from "./icons";
import { FieldContext } from "./field-context";

interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

/**
 * Label + control + error layout. The error renders with id `${htmlFor}-err`, the hint (shown
 * only when there is no error) with `${htmlFor}-hint`. Input, Textarea, Select and the picker
 * triggers read FieldContext and wire aria-describedby / aria-invalid / aria-required
 * themselves, so a form no longer repeats that per control.
 */
export function Field({ label, htmlFor, required = false, error, hint, children }: FieldProps) {
  const showHint = Boolean(hint) && !error;
  const aria = {
    describedById: error ? `${htmlFor}-err` : showHint ? `${htmlFor}-hint` : undefined,
    invalid: Boolean(error),
    required,
  };
  return (
    <FieldContext value={aria}>
      <div className="flex flex-col gap-2">
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink-1">
          {label}
          {required && <span className="text-jci-blue"> *</span>}
        </label>
        {children}
        {showHint && (
          <div id={`${htmlFor}-hint`} className="text-[13px] text-ink-3">
            {hint}
          </div>
        )}
        {error && (
          <div
            id={`${htmlFor}-err`}
            role="alert"
            className="flex items-center gap-1.5 text-[13px] text-error"
          >
            {Icon.close({ s: 13 })}
            {error}
          </div>
        )}
      </div>
    </FieldContext>
  );
}
