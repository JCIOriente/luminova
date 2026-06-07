import type { ReactNode } from "react";
import { Icon } from "./icons";

interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

/**
 * Label + control + error layout. The error renders with id `${htmlFor}-err`;
 * wire it on the control via aria-describedby when an error is present. An
 * optional `hint` shows below the control when there is no error.
 */
export function Field({ label, htmlFor, required = false, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink-1">
        {label}
        {required && <span className="text-jci-blue"> *</span>}
      </label>
      {children}
      {hint && !error && <div className="text-[13px] text-ink-3">{hint}</div>}
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
  );
}
