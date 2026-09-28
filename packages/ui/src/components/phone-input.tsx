import {
  useEffect,
  useEffectEvent,
  useRef,
  type ChangeEvent,
  type ComponentPropsWithRef,
} from "react";
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
 *  `event.target.value` after onChange rewrites it.
 *
 *  A typed key that adds nothing (a digit into a full field, or a non-digit) is cancelled in
 *  `beforeinput`, so value and caret stay exactly as they were, like `maxLength`. Everything
 *  else (paste, autofill, IME, a key that replaces a selection) goes through `sanitize` in
 *  onChange, and the caret keeps its place among the digits that remain. */
export function PhoneInput({ sanitize, onChange, ref, ...props }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // An Effect Event, so the listener attached once below always sees the current `sanitize`.
  const rejectDeadKey = useEffectEvent((event: InputEvent) => {
    const input = inputRef.current;
    if (!input || event.inputType !== "insertText" || event.data == null) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    if (start === null || start !== end) return;
    const current = input.value;
    const next = current.slice(0, start) + event.data + current.slice(end);
    // Same sanitized length means the key survived only by pushing a digit off the end, or
    // was stripped. A length drop (a 591 prefix collapsing) or a gain is allowed through.
    if (sanitize(next).length === sanitize(current).length) event.preventDefault();
  });

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const listener = (event: InputEvent) => rejectDeadKey(event);
    input.addEventListener("beforeinput", listener);
    return () => input.removeEventListener("beforeinput", listener);
  }, []);

  const setRefs = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const raw = input.value;
    const clean = sanitize(raw);
    if (clean !== raw) {
      const caret = input.selectionStart ?? raw.length;
      // Digits before the caret, minus any leading digits sanitize dropped as a prefix.
      const dropped = Math.max(0, raw.replace(/\D/g, "").indexOf(clean));
      const digitsBefore = raw.slice(0, caret).replace(/\D/g, "").length - dropped;
      input.value = clean;
      // Only a focused field owns a caret. Setting one on a blurred input can pull focus in
      // some browsers.
      if (input.ownerDocument.activeElement === input) {
        const at = Math.min(Math.max(digitsBefore, 0), clean.length);
        input.setSelectionRange(at, at);
      }
    }
    onChange?.(event);
  };

  return <Input type="tel" inputMode="tel" {...props} ref={setRefs} onChange={handleChange} />;
}
