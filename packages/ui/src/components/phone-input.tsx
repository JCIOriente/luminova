import type { ChangeEvent, ComponentPropsWithRef } from "react";
import { Input } from "./input";

interface PhoneInputProps extends Omit<ComponentPropsWithRef<"input">, "type" | "inputMode"> {
  /** Reduces raw typed or pasted text to what the field may hold, e.g.
   *  `sanitizeBoliviaPhoneInput` from `@luminova/types`. Injected rather than imported so
   *  the phone rules stay in the schema package and `@luminova/ui` keeps no dependency on it.
   *  Deliberately no `maxLength`: a browser truncates a paste to it BEFORE onChange runs, which
   *  would turn a pasted "+591 700 00000" into "+591 700". */
  sanitize: (raw: string) => string;
}

/** Phone control: tel keypad, and a value capped at input time — typing and pasting alike —
 *  for both RHF `register` (uncontrolled) and controlled callers, since both read
 *  `event.target.value` after this rewrites it. */
export function PhoneInput({ sanitize, onChange, ...props }: PhoneInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const clean = sanitize(event.target.value);
    // Only when it differs: assigning `.value` moves the caret to the end, so an unconditional
    // write would make every mid-string edit jump.
    if (clean !== event.target.value) event.target.value = clean;
    onChange?.(event);
  };
  return <Input type="tel" inputMode="tel" {...props} onChange={handleChange} />;
}
