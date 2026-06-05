import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}

/**
 * Label + control + error layout. The error renders with id `${htmlFor}-err`;
 * wire it on the control via aria-describedby when an error is present.
 */
export function Field({ label, htmlFor, required = false, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink-1">
        {label}
        {required && <span className="text-jci-blue"> *</span>}
      </label>
      {children}
      {error && (
        <div id={`${htmlFor}-err`} role="alert" className="text-[13px] text-[#c0392b]">
          {error}
        </div>
      )}
    </div>
  );
}
