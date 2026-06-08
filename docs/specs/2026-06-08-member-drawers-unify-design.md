# Member edit/invite slide-overs — unify on MemberForm

**Date:** 2026-06-08
**Status:** Approved (design)
**Scope:** `apps/backstage` members feature — 3 app-local components. No package API changes.

## Context

The members console has two slide-overs (Radix `Sheet`):

- **Edit** (`member-drawer.tsx`) — view/edit an existing member; edit mode renders the
  shared `MemberForm` (React Hook Form + Zod, inline per-field errors, all fields).
- **Invite** (`member-invite-drawer.tsx`) — create a new member; reimplements the form
  with ~80 lines of manual `useState`, whole-form validation only, **missing** phone
  and profession, a divergent preview header, and a hardcoded error color.

The invite drawer is effectively a worse copy of `MemberForm`. That duplication is the
root cause behind every improvement the user asked for: visual polish, form UX, unifying
the two slides, and showing more content. The fix is to make **`MemberForm` the single
form engine** both drawers share.

## Goals

1. **Unify** — invite delegates its form body to `MemberForm`, keeping only invite-specific
   bits (the "Enviar acceso" checkbox and the post-create success screen).
2. **Form UX** — invite inherits inline per-field validation; fields grouped into sections.
3. **More content** — invite gains teléfono + profesión; view mode shows them too.
4. **Visual polish** — seed-colored preview avatar consistent with the table/view;
   token error color; section headers.

## Design

### 1. `MemberForm` (`components/member-form.tsx`) — main work

- **Section grouping.** Render fields under two subtle section headers:
  - **Datos personales** — nombre, correo, teléfono, profesión, fecha de nacimiento
  - **Membresía** — rol, fecha de ingreso, estado

  Section header style: small uppercase label (mirror the view-mode `Detail` label —
  `text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase`), with the field group
  below. Keep the existing `flex flex-col gap-4` rhythm inside each section.

- **Seed-colored preview avatar.** Replace flat `bg-jci-navy` with
  `style={{ backgroundColor: avatarColor(seed) }}` where `seed` is a new optional prop
  (`avatarSeed?: string`). Edit passes `member.id`; invite passes the typed email or name
  (fall back to name when email empty). `avatarColor` already accepts any string
  (`member-display.ts`). Default seed → `previewName` so the avatar is never uncolored.

- **Children slot.** Add optional `children?: ReactNode`, rendered after the Membresía
  section and before the submit button. Invite injects its "Enviar acceso a la app"
  checkbox here. The checkbox's state lives in the invite drawer (it is not a `memberSchema`
  field) and is read at submit time — `MemberForm` just renders the slot.

- **Token error color.** Swap the hardcoded `text-[#c0392b]` for `text-error`.

- Public API stays backward compatible: existing props unchanged; `avatarSeed` and
  `children` are optional additive props.

### 2. `MemberInviteDrawer` (`components/member-invite-drawer.tsx`) — rewrite body

- Drop the manual `form` state, `EMAIL_RE`, `valid`, and all `<Field>`/`<Input>` markup.
- Simplify the stage machine to `form` → `done` (the in-flight "submitting" state is now
  owned by `MemberForm`'s `isSubmitting`, so a separate `creating` stage is redundant).
  Keep the `done` success screen ("Invitar a otra persona" / "Listo") and a local
  `sendAccess` boolean.
- Submit button label: `MemberForm` shows the static `submitLabel` and "Guardando…" while
  submitting. To preserve the invite's "Enviando…", add an optional `pendingLabel?: string`
  prop to `MemberForm` (defaults to "Guardando…"); invite passes `pendingLabel="Enviando…"`.
- Render `<MemberForm>` in the `form`/`creating` stage with:
  - `submitLabel="Enviar invitación"` (MemberForm already shows "Guardando…" while
    submitting; acceptable, or pass an invite-specific label — keep default behavior).
  - `avatarSeed` = email || name.
  - `children` = the `Checkbox` bound to `sendAccess`.
  - `onSubmit` = create → if `sendAccess` provision → `setStage("done")`; on throw,
    surface the error (MemberForm already renders `formError` on a rejected promise, so
    the invite `onSubmit` just rethrows / lets it reject).
- `joinDate` default = today (`MemberForm` EMPTY has empty joinDate; invite passes
  `defaultValues={{ joinDate: today(), status: "Activo" }}`).
- The `birthdate`-required nuance: `memberSchema` governs validation now (single source) —
  invite no longer hand-rolls `valid`.

### 3. `MemberDrawer` view mode (`components/member-drawer.tsx`)

- Add **Teléfono** (`member.phone ?? "—"`) and **Profesión** (`member.profession ?? "—"`)
  to the `<dl>` detail grid. Header avatar already uses `avatarColor(member.id)` — leave.

## Out of scope / YAGNI

- No change to `Sheet`, `Field`, `Checkbox`, or any `@luminova/ui` component.
- No new fields on `memberSchema` / `@luminova/types`.
- No change to repositories, hooks, or Firestore rules.
- Detail page (`/members/$memberId`) untouched.

## Boundaries (what each unit does after the change)

- **`MemberForm`** — renders + validates the member field set, emits `MemberInput` on submit;
  optionally renders a caller slot and a seeded avatar. Used by both drawers and edit mode.
- **`MemberInviteDrawer`** — owns the *create + provision + success* flow; delegates the
  form to `MemberForm`.
- **`MemberDrawer`** — owns *view vs edit* switch + read-only profile display; delegates
  edit to `MemberForm`.

## Verification

- `pnpm --filter backstage run ci` (eslint + tsc + vitest). Existing member-form / invite
  tests must pass; update any invite test that asserted the old manual markup.
- Manual (`pnpm --filter backstage dev` → `/members`):
  - **Invitar miembro**: form shows sections, teléfono + profesión present, inline errors
    on blur/submit, colored avatar reacts to typed name/email, "Enviar acceso" checkbox
    works, success screen unchanged.
  - **Editar miembro** (row ⋮ → Editar): same sectioned form, seed-colored avatar.
  - **Ver perfil**: detail grid now shows Teléfono + Profesión.
```
