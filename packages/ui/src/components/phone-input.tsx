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
  start: number;
  end: number;
}

/** Edits that may legitimately be cut down to fit. Everything else the user types or composes
 *  is never truncated. */
const TRUNCATABLE_INPUT = new Set(["insertFromPaste", "insertFromDrop", "insertReplacementText"]);

/** Only a focused field owns a caret. Setting one on a blurred input can pull focus in some
 *  browsers. */
function placeSelection(input: HTMLInputElement, start: number, end = start) {
  if (input.ownerDocument.activeElement === input) input.setSelectionRange(start, end);
}

/** How many leading digits of `raw` sanitize dropped as a prefix, and whether it also dropped
 *  any after that (a truncation). Relies on the sanitize contract: `clean` is a contiguous run
 *  of raw's digits. */
function digitLoss(raw: string, clean: string) {
  const digits = raw.replace(/\D/g, "");
  // Not indexOf alone: kept digits that repeat the prefix ("591591") would match too early.
  const truncated = !digits.endsWith(clean);
  const prefix = truncated ? Math.max(0, digits.indexOf(clean)) : digits.length - clean.length;
  return { prefix, truncated };
}

/** Phone control: tel keypad, and a value capped at input time for typing and pasting alike.
 *  Works for RHF `register` (uncontrolled) and controlled callers, since both read
 *  `event.target.value` after onChange rewrites it.
 *
 *  One rule: typing and composing can never truncate. `beforeinput` snapshots the value and
 *  selection for every edit except paste, drop and autofill. If sanitizing the resulting raw
 *  value would drop digits beyond a leading country-code prefix, onChange restores the
 *  snapshot instead. Paste, drop, autofill (and input with no beforeinput) are sanitized and
 *  truncated, and the caret keeps its place among the digits that remain. Two cancellable
 *  keys are also rejected up front: one that sanitizes to nothing, and a digit into a full
 *  field. */
export function PhoneInput({ sanitize, onChange, ref, ...props }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // The field as it stood just before the edit now in flight. Lives for one event: onChange
  // consumes it, and a timer drops it if no input event follows, so it can never go stale.
  const snapshot = useRef<Snapshot | null>(null);

  // An Effect Event, so the listener attached once below always sees the current `sanitize`.
  const onBeforeInput = useEffectEvent((event: InputEvent) => {
    snapshot.current = null;
    const input = inputRef.current;
    if (!input || TRUNCATABLE_INPUT.has(event.inputType)) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    if (event.inputType === "insertText" && event.data != null) {
      const next = input.value.slice(0, start) + event.data + input.value.slice(end);
      // A key that sanitizes to nothing would only delete what it replaces; a digit at the caret
      // of a full field would be undone in onChange anyway. Cancelling spares the input event.
      const addsNothing = sanitize(event.data) === "";
      const overflows = start === end && sanitize(next).length === sanitize(input.value).length;
      if (addsNothing || overflows) {
        event.preventDefault();
        return;
      }
    }
    snapshot.current = { value: input.value, start, end };
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
    const loss = digitLoss(raw, clean);
    if (before && loss.truncated) {
      input.value = before.value;
      placeSelection(input, before.start, before.end);
    } else if (clean !== raw) {
      const caret = input.selectionStart ?? raw.length;
      const digitsBefore = raw.slice(0, caret).replace(/\D/g, "").length - loss.prefix;
      input.value = clean;
      placeSelection(input, Math.min(Math.max(digitsBefore, 0), clean.length));
    }
    onChange?.(event);
  };

  return <Input type="tel" inputMode="tel" {...props} ref={setRefs} onChange={handleChange} />;
}
