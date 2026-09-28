import { useRef, type ChangeEvent, type ComponentPropsWithRef, type FocusEvent } from "react";
import { Input } from "./input";

interface PhoneInputProps extends Omit<ComponentPropsWithRef<"input">, "type" | "inputMode"> {
  /** Reduces raw typed or pasted text to what the field may hold, e.g.
   *  `sanitizeBoliviaPhoneInput` from `@luminova/types`. Injected rather than imported so
   *  the phone rules stay in the schema package and `@luminova/ui` keeps no dependency on it.
   *  Deliberately no `maxLength`: a browser truncates a paste to it BEFORE onChange runs, which
   *  would turn a pasted "+591 700 00000" into "+591 700". */
  sanitize: (raw: string) => string;
}

/** Phone control: tel keypad, and a value capped at input time for typing and pasting alike.
 *  Works for RHF `register` (uncontrolled) and controlled callers, since both read
 *  `event.target.value` after this rewrites it.
 *
 *  A single keystroke into a full field is rejected the way `maxLength` would reject it: the
 *  previous value and caret stay. A paste is sanitized and truncated. When sanitizing strips
 *  characters, the caret keeps its place among the characters that remain. */
export function PhoneInput({ sanitize, onChange, onFocus, ...props }: PhoneInputProps) {
  // The last value this field settled on. Refreshed on focus so an RHF reset or a controlled
  // update made while the field was idle is picked up before the next keystroke.
  const settled = useRef("");

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    settled.current = event.target.value;
    onFocus?.(event);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const previous = settled.current;
    const clean = sanitize(raw);
    const oneCharInserted = raw.length === previous.length + 1;
    let nextCaret: number | null = null;

    // Same length and different content means sanitize had to push a character off the end
    // to fit the inserted one, so the keystroke overflowed a full field.
    if (oneCharInserted && clean.length === previous.length && clean !== previous) {
      input.value = previous;
      nextCaret = caret - 1;
    } else if (clean !== raw) {
      input.value = clean;
      nextCaret = Math.min(sanitize(raw.slice(0, caret)).length, clean.length);
    }
    // Only a focused field owns a caret. Setting one on a blurred input can pull focus in
    // some browsers.
    if (nextCaret !== null && input.ownerDocument.activeElement === input) {
      input.setSelectionRange(nextCaret, nextCaret);
    }
    settled.current = input.value;
    onChange?.(event);
  };

  return (
    <Input type="tel" inputMode="tel" {...props} onFocus={handleFocus} onChange={handleChange} />
  );
}
