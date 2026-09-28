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
- **One rule: typing and composing can never truncate.** A native `beforeinput` listener
  snapshots the value and selection for every edit except `insertFromPaste`, `insertFromDrop`
  and `insertReplacementText` (autofill), whatever the selection. If sanitizing the resulting
  raw value would drop digits beyond a leading country-code prefix, `onChange` restores the
  snapshot's value and selection instead. That covers a digit typed into a full field, and
  every update of an IME composition, including the later updates Chromium delivers with the
  composed range selected.
- The prefix strip is not a drop: a typed `591` collapsing on the ninth digit goes through.
- The snapshot lives for one event. `onChange` consumes it, and a timer drops it if no input
  event follows, so there is no long-lived cached value.
- Two cancellable `insertText` keys are rejected up front in `beforeinput`, so no input event
  fires at all:
  - a key that sanitizes to nothing, whatever the selection, so it cannot delete what it
    would replace;
  - a digit into a full field at a collapsed caret.
- Paste, drop and autofill, and an `input` event with no `beforeinput`, are sanitized and
  truncated. A paste into a selection keeps its first digits up to the cap, as `maxLength`
  would.
- After sanitizing, the caret is set to the number of digits before it in the raw value, minus
  any prefix digits that were dropped, clamped to `[0, clean.length]`. It is only set while the
  field is focused. This relies on the `sanitize` contract: the result is an in-order,
  contiguous run of the raw digits.
- The forwarded ref is merged through a `useCallback` keyed on `ref`, so a stable callback or
  object ref stays attached across renders, and a React 19 ref cleanup is honored. RHF's
  `register()` returns a new ref on every render, so that one reattaches each render, as it
  does on a plain `<input>`.
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

**Forms validate on blur.**
- Every backstage `useForm` sets `mode: "onTouched"`. A field shows its error when the user
  leaves it, then re-validates as they type.
- A rejected submit still focuses the first invalid field (RHF's `shouldFocusError` default).
- site-config still hides every error until the first save attempt (`attempted`), so a long
  form does not light up while the editor is filling it in.

**Schemas trim what they validate.**
- Emails are `.trim()`ed before `.email()` in the member, ally, login and site-config contact
  schemas, so a pasted address with padding is saved bare.
- Ally company and contact names, and position, activity and initiative titles, are
  `.trim()`ed before `.min()`, so whitespace alone does not pass.

**Login checks only that a password was typed.**
- The strength policy (`passwordSchema`) applies where a password is chosen, on the invite
  redeem page. On login it would lock out every member whose password predates the policy.
- Login and invite-redeem fields carry the required marker and `aria-required`.

**A Bolivian number starts with 2, 3, 4, 6 or 7.**
- Landlines start 2, 3 or 4, and mobiles start 6 or 7. `BOLIVIA_PHONE_PATTERN` in
  `packages/types/src/phone.ts` is `^[23467][0-9]{7}$`.
- `firestore.rules` holds the same text in `selfProfileValid()`.
  `member-self-lane.rules.test.ts` fails if the two differ by a byte.
- `PhoneInput` does not block a leading 0, 1 or 5. Typing `00591…` or `591…` one key at a time
  passes through those digits before the prefix is stripped. The field shows the validation
  error instead.
- `boliviaWhatsAppUrl` relies on the same check. A stored number that no longer passes gets
  no WhatsApp link.

## Out of scope

- Password `maxLength`. Truncating a pasted password would silently save a different one.
