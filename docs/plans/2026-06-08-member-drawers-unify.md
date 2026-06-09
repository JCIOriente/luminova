# Member Drawers Unify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `MemberForm` the single form engine shared by the edit and invite slide-overs, with sectioned fields, a seed-colored preview avatar, and richer view mode.

**Architecture:** `MemberInviteDrawer` stops hand-rolling a form and delegates to `MemberForm` (keeping only its create→provision→success flow + the "Enviar acceso" checkbox via a new `children` slot). `MemberForm` gains additive props (`avatarSeed`, `pendingLabel`, `children`), section headers, a colored avatar, and the `text-error` token. `MemberDrawer` view mode shows phone + profession. All changes are app-local in `apps/backstage`; no `@luminova/*` package API changes.

**Tech Stack:** React 19, React Hook Form + Zod, `@luminova/ui`, Vitest + Testing Library.

**Spec:** `docs/specs/2026-06-08-member-drawers-unify-design.md`

---

### Task 1: Extend `MemberForm` (sections, colored avatar, slot, pending label)

**Files:**
- Modify: `apps/backstage/src/features/members/components/member-form.tsx`
- Test: `apps/backstage/src/features/members/components/member-form.test.tsx`

- [ ] **Step 1: Add the failing tests**

Append inside the existing `describe("MemberForm", …)` block in `member-form.test.tsx`:

```tsx
  it("groups fields under section headers", () => {
    render(<MemberForm submitLabel="Crear" onSubmit={async () => {}} />);
    expect(screen.getByText("Datos personales")).toBeInTheDocument();
    expect(screen.getByText("Membresía")).toBeInTheDocument();
  });

  it("renders a children slot before the submit button", () => {
    render(
      <MemberForm submitLabel="Crear" onSubmit={async () => {}}>
        <span>extra-slot</span>
      </MemberForm>,
    );
    expect(screen.getByText("extra-slot")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter backstage exec vitest run src/features/members/components/member-form.test.tsx`
Expected: FAIL — `Unable to find an element with the text: Datos personales` and `extra-slot`.

- [ ] **Step 3: Implement the changes**

Replace the full contents of `member-form.tsx` with:

```tsx
import { useId, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input, Select } from "@luminova/ui";
import { memberSchema, type MemberInput, MEMBER_STATUSES } from "@luminova/types";
import { ROLE_SUGGESTIONS } from "../lib/role-suggestions";
import { avatarColor } from "../lib/member-display";
import { initials } from "../../../lib/initials";

interface MemberFormProps {
  defaultValues?: Partial<MemberInput>;
  submitLabel: string;
  pendingLabel?: string;
  onSubmit: (data: MemberInput) => Promise<void>;
  showPreview?: boolean;
  avatarSeed?: string;
  children?: ReactNode;
}

const EMPTY: MemberInput = {
  name: "",
  email: "",
  phone: "",
  role: "",
  profession: "",
  joinDate: "",
  birthdate: "",
  status: "Activo",
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">{children}</h3>
  );
}

export function MemberForm({
  defaultValues,
  submitLabel,
  pendingLabel,
  onSubmit,
  showPreview,
  avatarSeed,
  children,
}: MemberFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const roleListId = useId();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MemberInput>({
    resolver: zodResolver(memberSchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  });

  const previewName = watch("name");
  const previewRole = watch("role");
  const seed = avatarSeed?.trim() || previewName?.trim() || "nuevo";

  const submit = handleSubmit(async (data) => {
    setFormError(null);
    try {
      await onSubmit(data);
    } catch {
      setFormError("No se pudo guardar. Intenta de nuevo.");
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {showPreview && (
        <div className="flex items-center gap-3 rounded-card border border-line bg-surface-2 p-3.5">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-white"
            style={{ backgroundColor: avatarColor(seed) }}
          >
            {initials(previewName || "")}
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink-1">
              {previewName?.trim() || "Nuevo miembro"}
            </div>
            <div className="truncate text-[13px] text-ink-3">{previewRole?.trim() || "Rol"}</div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <SectionLabel>Datos personales</SectionLabel>
        <Field label="Nombre" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" {...register("name")} />
        </Field>
        <Field label="Correo" htmlFor="email" required error={errors.email?.message}>
          <Input id="email" type="email" {...register("email")} />
        </Field>
        <Field label="Teléfono" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" {...register("phone")} />
        </Field>
        <Field label="Profesión" htmlFor="profession" error={errors.profession?.message}>
          <Input id="profession" {...register("profession")} />
        </Field>
        <Field
          label="Fecha de nacimiento"
          htmlFor="birthdate"
          required
          error={errors.birthdate?.message}
        >
          <Input id="birthdate" type="date" {...register("birthdate")} />
        </Field>
      </div>

      <div className="flex flex-col gap-4">
        <SectionLabel>Membresía</SectionLabel>
        <Field label="Rol" htmlFor="role" required error={errors.role?.message}>
          <Input id="role" list={roleListId} {...register("role")} />
          <datalist id={roleListId}>
            {ROLE_SUGGESTIONS.map((role) => (
              <option key={role} value={role} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Fecha de ingreso"
          htmlFor="joinDate"
          required
          error={errors.joinDate?.message}
        >
          <Input id="joinDate" type="date" {...register("joinDate")} />
        </Field>
        <Field label="Estado" htmlFor="status" required error={errors.status?.message}>
          <Select id="status" {...register("status")}>
            {MEMBER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {children}

      {formError && (
        <div role="alert" className="text-[13px] text-error">
          {formError}
        </div>
      )}
      <Button as="button" type="submit" disabled={isSubmitting} className="mt-1 w-full justify-center">
        {isSubmitting ? (pendingLabel ?? "Guardando…") : submitLabel}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter backstage exec vitest run src/features/members/components/member-form.test.tsx`
Expected: PASS — all tests (the two original + two new).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/members/components/member-form.tsx apps/backstage/src/features/members/components/member-form.test.tsx
git commit -m "feat(members): MemberForm sections, colored avatar, slot + pending label"
```

---

### Task 2: Rewrite `MemberInviteDrawer` on top of `MemberForm`

**Files:**
- Modify: `apps/backstage/src/features/members/components/member-invite-drawer.tsx`
- Test: `apps/backstage/src/features/members/components/member-invite-drawer.test.tsx`

- [ ] **Step 1: Update the tests**

The old "disables submit" test asserted a disabled button (manual validation). `MemberForm` validates on submit instead, so replace the first test. Replace the whole file `member-invite-drawer.test.tsx` with:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemberInviteDrawer } from "./member-invite-drawer";

function fill() {
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Ana Gómez" } });
  fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: "ana@jci.bo" } });
  fireEvent.change(screen.getByLabelText(/Fecha de nacimiento/), {
    target: { value: "1990-01-01" },
  });
}

describe("MemberInviteDrawer", () => {
  it("blocks submit and stays on the form when required fields are empty", async () => {
    const onCreate = vi.fn();
    render(
      <MemberInviteDrawer
        open
        onClose={() => {}}
        onCreate={onCreate}
        onProvision={async () => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() =>
      expect(screen.getAllByText("Mínimo 3 caracteres.").length).toBeGreaterThan(0),
    );
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("creates the member then provisions login when access is checked, reaching done", async () => {
    const onCreate = vi.fn().mockResolvedValue("new-id");
    const onProvision = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberInviteDrawer open onClose={() => {}} onCreate={onCreate} onProvision={onProvision} />,
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByText("Ana Gómez fue agregada")).toBeInTheDocument());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onProvision).toHaveBeenCalledWith("new-id");
    expect(screen.getByText(/recibirá un enlace/)).toBeInTheDocument();
  });

  it("skips provisioning when access is unchecked", async () => {
    const onProvision = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberInviteDrawer
        open
        onClose={() => {}}
        onCreate={async () => "id2"}
        onProvision={onProvision}
      />,
    );
    fill();
    fireEvent.click(screen.getByLabelText("Enviar acceso a la app"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByText("Ana Gómez fue agregada")).toBeInTheDocument());
    expect(onProvision).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter backstage exec vitest run src/features/members/components/member-invite-drawer.test.tsx`
Expected: FAIL — the new empty-submit test won't find "Mínimo 3 caracteres." yet (old component uses a disabled button, no inline error), and the `fill()` flow may not reach done because role is unset under the old/new validation boundary.

- [ ] **Step 3: Rewrite the component**

Replace the full contents of `member-invite-drawer.tsx` with:

```tsx
import { useState } from "react";
import { Button, Checkbox, Sheet } from "@luminova/ui";
import { type MemberInput } from "@luminova/types";
import { MemberForm } from "./member-form";
import { actionMessage } from "../lib/member-display";

interface MemberInviteDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: MemberInput) => Promise<string>;
  onProvision: (memberId: string) => Promise<void>;
}

interface DoneState {
  name: string;
  email: string;
  provisioned: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MemberInviteDrawer({
  open,
  onClose,
  onCreate,
  onProvision,
}: MemberInviteDrawerProps) {
  const [done, setDone] = useState<DoneState | null>(null);
  const [sendAccess, setSendAccess] = useState(true);

  const reset = () => {
    setDone(null);
    setSendAccess(true);
  };

  const close = () => {
    onClose();
    reset();
  };

  const handleSubmit = async (data: MemberInput) => {
    const id = await onCreate(data);
    let provisioned = false;
    if (sendAccess) {
      await onProvision(id);
      provisioned = true;
    }
    setDone({ name: data.name, email: data.email, provisioned });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title="Invitar miembro"
    >
      {done ? (
        <div className="flex flex-col gap-5">
          <p className="text-[15px] font-semibold text-ink-1">
            {actionMessage(done.name, "created")}
          </p>
          <p className="text-[14px] text-ink-2">
            {done.provisioned
              ? `${done.email} recibirá un enlace para crear su contraseña y acceder a la app.`
              : "Aún no tiene acceso a la app. Podrás invitarlo desde el menú de su fila."}
          </p>
          <div className="flex flex-col gap-3">
            <Button as="button" type="button" onClick={reset} className="w-full justify-center">
              Invitar a otra persona
            </Button>
            <Button
              as="button"
              type="button"
              variant="secondary"
              onClick={close}
              className="w-full justify-center"
            >
              Listo
            </Button>
          </div>
        </div>
      ) : (
        <MemberForm
          submitLabel="Enviar invitación"
          pendingLabel="Enviando…"
          showPreview
          defaultValues={{ role: "Miembro activo", joinDate: today(), status: "Activo" }}
          onSubmit={handleSubmit}
        >
          <Checkbox
            checked={sendAccess}
            onChange={setSendAccess}
            label="Enviar acceso a la app"
          />
        </MemberForm>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter backstage exec vitest run src/features/members/components/member-invite-drawer.test.tsx`
Expected: PASS — all three tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/members/components/member-invite-drawer.tsx apps/backstage/src/features/members/components/member-invite-drawer.test.tsx
git commit -m "feat(members): invite drawer delegates to MemberForm"
```

---

### Task 3: Enrich `MemberDrawer` view mode (phone + profession)

**Files:**
- Modify: `apps/backstage/src/features/members/components/member-drawer.tsx`
- Test: `apps/backstage/src/features/members/components/member-drawer.test.tsx`

- [ ] **Step 1: Add the failing test**

Append inside the `describe("MemberDrawer view mode", …)` block in `member-drawer.test.tsx`:

```tsx
  it("shows phone and profession labels", () => {
    render(
      <AbilityProvider claims={{ roles: ["Admin"] }} uid="admin">
        <MemberDrawer
          open
          mode="view"
          member={m}
          onClose={() => {}}
          onEditMode={() => {}}
          onSubmit={async () => {}}
        />
      </AbilityProvider>,
    );
    expect(screen.getByText("Teléfono")).toBeInTheDocument();
    expect(screen.getByText("Profesión")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/members/components/member-drawer.test.tsx`
Expected: FAIL — `Unable to find an element with the text: Teléfono`.

- [ ] **Step 3: Add the two details**

In `member-drawer.tsx`, in the `ViewBody` `<dl>` grid, insert the two `Detail` rows after the Rol detail (line ~67):

```tsx
        <Detail label="Correo" value={member.email} />
        <Detail label="Rol" value={member.role} />
        <Detail label="Teléfono" value={member.phone || "—"} />
        <Detail label="Profesión" value={member.profession || "—"} />
        <Detail label="Miembro desde" value={member.joinDate ? joinYear(member.joinDate) : "—"} />
        <Detail label="Puntos" value={member.totalPoints ?? 0} />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/members/components/member-drawer.test.tsx`
Expected: PASS — both view-mode tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/members/components/member-drawer.tsx apps/backstage/src/features/members/components/member-drawer.test.tsx
git commit -m "feat(members): view mode shows phone + profession"
```

---

### Task 4: Full verification

- [ ] **Step 1: Run the full backstage CI**

Run: `pnpm --filter backstage run ci`
Expected: eslint + tsc + vitest all PASS (175+ tests).

- [ ] **Step 2: Format check the touched files**

Run: `pnpm exec prettier --check "apps/backstage/src/features/members/components/member-form.tsx" "apps/backstage/src/features/members/components/member-invite-drawer.tsx" "apps/backstage/src/features/members/components/member-drawer.tsx"`
Expected: "All matched files use Prettier code style!" (run `--write` then re-stage if not).

- [ ] **Step 3: Manual smoke (optional, dev server)**

Run: `pnpm --filter backstage dev` → open `/members`:
- **Invitar miembro** — sectioned form (Datos personales / Membresía), teléfono + profesión present, colored avatar reacts to typed name, inline errors on empty submit, "Enviar acceso" toggles provisioning, success screen unchanged.
- **Editar miembro** (row ⋮ → Editar) — same sectioned form, avatar colored by member id.
- **Ver perfil** — detail grid shows Teléfono + Profesión.

---

## Self-Review Notes

- **Spec coverage:** sections (Task 1) · colored avatar (Task 1) · token error (Task 1) · children slot/checkbox (Tasks 1+2) · invite unification (Task 2) · phone/profession in form (Task 1, already in MemberForm) · phone/profession in view (Task 3) · pendingLabel (Tasks 1+2). All covered.
- **Behavior preserved:** role stays effectively optional for invite via `defaultValues.role = "Miembro activo"`; joinDate defaults to today; sendAccess defaults checked.
- **avatarSeed:** invite omits it (avatar colors from watched name); edit passes `member.id` — that wiring already exists in `MemberDrawer` via `MemberForm`'s existing usage. NOTE: `MemberDrawer` edit mode currently calls `<MemberForm key={member.id} showPreview … />` without `avatarSeed`; to color the edit avatar by id, add `avatarSeed={member.id}` there. This is a 1-line addition — fold it into Task 3's edit (add `avatarSeed={member.id}` to the `<MemberForm>` in `member-drawer.tsx`).
```
