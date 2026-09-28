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
  `591` once it pushes past the national length, and truncates to `BOLIVIA_PHONE_LENGTH`.
- Stripping `591` is safe because no Bolivian national number starts with 5.
- `maxLength` would be wrong. A browser truncates a paste to it before `onChange` runs, so a
  pasted `+591 700 00000` would become `+591 700`.
- `normalizeBoliviaPhone`, and the schemas built on it, are unchanged.

**`@luminova/ui` `PhoneInput` takes the sanitizer as a required `sanitize` prop.**
- It renders `type="tel"` with `inputMode="tel"`, and rewrites `event.target.value` before
  calling the caller's `onChange`. That serves RHF `register` (uncontrolled) and controlled
  callers alike.
- The value is only written back when it changed, so the caret does not jump.
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
