import {
  useCallback,
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
   *
   *  Contract the caret math relies on: the result must be an in-order, contiguous run of
   *  `raw`'s digits (drop a leading prefix and/or a tail, never reorder or skip inside).
   *
   *  Deliberately no `maxLength`: a browser truncates a paste to it BEFORE onChange runs, which
   *  would turn a pasted "+591 700 00000" into "+591 700". */
  sanitize: (raw: string) => string;
}

interface Snapshot {
  value: string;
  caret: number;
}

/** Only a focused field owns a caret. Setting one on a blurred input can pull focus in some
 *  browsers. */
function placeCaret(input: HTMLInputElement, at: number) {
  if (input.ownerDocument.activeElement === input) input.setSelectionRange(at, at);
}

/** Phone control: tel keypad, and a value capped at input time for typing and pasting alike.
 *  Works for RHF `register` (uncontrolled) and controlled callers, since both read
 *  `event.target.value` after onChange rewrites it.
 *
 *  A typed key that adds nothing (a digit into a full field, or any non-digit) is cancelled in
 *  `beforeinput`, so value and caret stay exactly as they were, like `maxLength`. Input that
 *  cannot be cancelled (composition) is undone in onChange against a one-event snapshot taken
 *  in `beforeinput`. Everything else (paste, autofill, a key that replaces a selection) goes
 *  through `sanitize`, and the caret keeps its place among the digits that remain. */
export function PhoneInput({ sanitize, onChange, ref, ...props }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // The field as it stood just before the edit now in flight. Lives for one event: onChange
  // consumes it, and a timer drops it if no input event follows, so it can never go stale.
  const snapshot = useRef<Snapshot | null>(null);

  // An Effect Event, so the listener attached once below always sees the current `sanitize`.
  const onBeforeInput = useEffectEvent((event: InputEvent) => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    if (event.inputType === "insertText" && event.data != null && start !== null) {
      // A key that sanitizes to nothing would only delete whatever it replaces.
      const addsNothing = sanitize(event.data) === "";
      const next = input.value.slice(0, start) + event.data + input.value.slice(end ?? start);
      // Same sanitized length into a caret means the key survives only by pushing a digit off
      // the end. A length drop (a 591 prefix collapsing) or a gain is allowed through.
      const overflows = start === end && sanitize(next).length === sanitize(input.value).length;
      if (addsNothing || overflows) {
        event.preventDefault();
        return;
      }
    }
    // Only an insertion at a caret can overflow by one. A replaced selection keeps what fits.
    if (start === null || start !== end) return;
    snapshot.current = { value: input.value, caret: start };
    setTimeout(() => {
      snapshot.current = null;
    });
  });

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const listener = (event: InputEvent) => onBeforeInput(event);
    input.addEventListener("beforeinput", listener);
    return () => input.removeEventListener("beforeinput", listener);
  }, []);

  const setRefs = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === "function") {
        const cleanup = ref(node);
        return () => {
          inputRef.current = null;
          if (typeof cleanup === "function") cleanup();
          else ref(null);
        };
      }
      if (ref) ref.current = node;
      return () => {
        inputRef.current = null;
        if (ref) ref.current = null;
      };
    },
    [ref],
  );

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const raw = input.value;
    const before = snapshot.current;
    snapshot.current = null;
    const clean = sanitize(raw);
    if (
      before &&
      raw.length === before.value.length + 1 &&
      clean.length === sanitize(before.value).length
    ) {
      input.value = before.value;
      placeCaret(input, before.caret);
    } else if (clean !== raw) {
      const caret = input.selectionStart ?? raw.length;
      const dropped = Math.max(0, raw.replace(/\D/g, "").indexOf(clean));
      const digitsBefore = raw.slice(0, caret).replace(/\D/g, "").length - dropped;
      input.value = clean;
      placeCaret(input, Math.min(Math.max(digitsBefore, 0), clean.length));
    }
    onChange?.(event);
  };

  return <Input type="tel" inputMode="tel" {...props} ref={setRefs} onChange={handleChange} />;
}
