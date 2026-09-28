# Input constraints come from the schema

## Problem

A form field's zod schema is the only definition of what the field may hold, but the `<input>`
enforced little of it. Phone fields took 16 raw characters and only rejected the extra digits on
submit. Length caps were either absent or hand-typed copies of the schema's number. Field
rendered an error that most controls never pointed at. Each gap was fixed per form, if at all.

## Design

**The bound is exported from `@luminova/types`, and the schema and the input both read it.**
There is no second literal. The constants are `BOLIVIA_PHONE_LENGTH`,
`ACTIVITY_LOCATION_MAX_LENGTH`, `LEAD_*_MAX_LENGTH`, `NOTIFICATION_*_MAX_LENGTH` and
`POSITION_TERM_MIN/MAX`, alongside the existing `MEMBER_NAME_MAX_LENGTH` and
`ROLE_NAME_MAX_LENGTH`. Zod stays the submit-time backstop. An input bound only stops the user
from typing past it.

**Phone numbers are sanitized, not `maxLength`-capped.**
- `sanitizeBoliviaPhoneInput` in `packages/types/src/phone.ts` keeps digits only, drops a leading
  `591` or `00591` once it pushes past the national length, and truncates to
  `BOLIVIA_PHONE_LENGTH`.
- Stripping the prefix is safe because no Bolivian national number starts with 0 or 5.
- Truncation is deliberate: pasting can never go past the length. The trade-off is that a
  9-digit typo is cut to a valid-looking 8-digit number.
- `maxLength` would be wrong. A browser truncates a paste to it before `onChange` runs, so a
  pasted `+591 700 00000` would become `+591 700`.
- `normalizeBoliviaPhone`, and the schemas built on it, are unchanged.

**`@luminova/ui` `PhoneInput` takes the sanitizer as a required `sanitize` prop.**
- It renders `type="tel"` with `inputMode="tel"`, and rewrites `event.target.value` before
  calling the caller's `onChange`. That serves RHF `register` (uncontrolled) and controlled
  callers alike.
- A native `beforeinput` listener cancels a typed key (`insertText`) that adds nothing:
  - any key that sanitizes to nothing (a non-digit), whatever the selection, so it cannot
    delete what it would replace;
  - a key into a collapsed selection when sanitizing the would-be value gives the same length
    as sanitizing the current one (a digit into a full field).

  Value and caret stay as they were, like `maxLength`. A key whose insertion shortens the
  sanitized value (a typed `591` prefix collapsing on the ninth digit) goes through.
- Input that cannot be cancelled (`insertCompositionText` from an IME) is undone in `onChange`.
  For an edit at a caret, `beforeinput` snapshots the value and caret. If the raw value then
  grew by exactly one character without the sanitized length growing, the snapshot is restored.
  The snapshot lives for one event: `onChange` consumes it, and a timer drops it if no input
  event follows. So there is still no long-lived cached value.
- An `input` event with no `beforeinput` at all is sanitized and truncated like a paste.
- Everything else (paste, autofill, a key that replaces a selection) is sanitized in `onChange`.
  A paste into a selection keeps its first digits up to the cap, as `maxLength` would.
- After sanitizing, the caret is set to the number of digits before it in the raw value, minus
  any prefix digits that were dropped, clamped to `[0, clean.length]`. It is only set while the
  field is focused. This relies on the `sanitize` contract: the result is an in-order,
  contiguous run of the raw digits.
- The forwarded ref is merged through a `useCallback` keyed on `ref`, so RHF's register ref is
  not detached and reattached on every render. A React 19 ref cleanup is honored.
- The sanitizer is injected rather than imported so that `@luminova/ui` keeps no dependency on
  `@luminova/types`.

**Field owns control aria.**
- `Field` publishes a context: `field-context.ts`.
- `Input`, `Textarea` and `Select` read it and set three attributes:
  - `aria-describedby` points at the rendered error (`${htmlFor}-err`) or the hint
    (`${htmlFor}-hint`). It is merged with and deduped against the caller's own value.
  - `aria-invalid` is set while an error shows. An explicit prop still wins.
  - `aria-required` is set when the label shows the asterisk.
- The button-rendered pickers (Combobox, MultiSelect, DatePicker, DateTimePicker) take only the
  describedby. `aria-invalid` and `aria-required` are not supported on `role=button`.

## Out of scope (decided separately)

These are behavior changes:
- when errors appear (submit vs blur)
- trimming what gets saved
- login enforcing the full password policy client-side
- password `maxLength` (truncating a pasted password would silently save a different one)
