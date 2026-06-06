# E5 Popover + E1 Combobox + E2 Multi-select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three reusable `@luminova/ui` widgets — a Radix `Popover` (E5), a cmdk-backed searchable `Combobox` (E1), and a `MultiSelect` (E2) — that D1 (Events/Activities CRUD) consumes for its parent picker + roster selects.

**Architecture:** Each widget wraps a Radix/cmdk primitive and is styled with JCI design tokens via pure Tailwind utilities (mirrors the existing `Dialog`/`Tooltip` wrappers), exposes controlled props, and is barrel-exported. Pure array logic for the multi-select is extracted to a testable `.ts` module (ui package runs pure tests only); DOM behavior is proven by render tests in backstage (jsdom).

**Tech Stack:** React 19, `@radix-ui/react-popover@^1.1.16`, `cmdk@^1.1.1`, Tailwind v4, vitest, @testing-library/react.

**Pre-done:** deps already added to `packages/ui/package.json` (secure-dep-vetting passed: latest stable, React-19 peers ok, audit clean bar the pre-existing I5 moderate).

**Token notes (verified against `packages/ui/src/theme.css`):** colors `ink-1/2/3`, `line`, `line-strong`, `surface`, `surface-2`, `jci-blue`; radius `rounded-card`. There is **no** `jci-mist` — use `surface-2` for the active-item highlight. Reuse `fieldControlClasses` from `./input` for the trigger. Icons: `Icon.chevExpand`, `Icon.check`, `Icon.search`, `Icon.close` (call style `Icon.check({ s: 16 })`).

---

### Task 1: E5 `Popover` primitive

**Files:**
- Create: `packages/ui/src/components/popover.tsx`
- Modify: `packages/ui/src/index.ts` (add export)

- [ ] **Step 1: Write the component**

```tsx
// packages/ui/src/components/popover.tsx
import type { ReactNode } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import { cn } from "../lib/cn";

interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  contentClassName?: string;
}

/** Floating surface on Radix Popover, styled with JCI tokens. Shared by Combobox/MultiSelect/menus. */
export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = "start",
  side = "bottom",
  contentClassName,
}: PopoverProps) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 rounded-card border border-line bg-surface p-1 shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)]",
            contentClassName,
          )}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
```

- [ ] **Step 2: Add the barrel export**

In `packages/ui/src/index.ts`, after the `Tooltip` export line, add:

```ts
export { Popover } from "./components/popover";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @luminova/ui run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/popover.tsx packages/ui/src/index.ts
git commit -m "feat(ui): E5 Popover primitive on Radix"
```

---

### Task 2: E1 `Combobox` (single-select + search)

**Files:**
- Create: `packages/ui/src/components/combobox.tsx`
- Modify: `packages/ui/src/index.ts` (add export)

- [ ] **Step 1: Write the component**

```tsx
// packages/ui/src/components/combobox.tsx
import { useState } from "react";
import { Command } from "cmdk";
import * as RadixPopover from "@radix-ui/react-popover";
import { cn } from "../lib/cn";
import { fieldControlClasses } from "./input";
import { Icon } from "./icons";

export type ComboboxOption = { value: string; label: string; disabled?: boolean };

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
}

/** Single-select + search on Radix Popover + cmdk, JCI-token styled. Re-select clears. */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  emptyText = "Sin resultados",
  disabled,
  id,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            fieldControlClasses,
            "flex items-center justify-between gap-2 text-left disabled:opacity-60",
            !selected && "text-ink-3",
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <span className="shrink-0 text-ink-2">{Icon.chevExpand({ s: 16 })}</span>
        </button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-card border border-line bg-surface p-1 shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)]"
        >
          <Command className="flex flex-col gap-1">
            <div className="flex items-center gap-2 border-b border-line px-2 pb-2 pt-1 text-ink-2">
              {Icon.search({ s: 16 })}
              <Command.Input
                placeholder={searchPlaceholder}
                className="w-full bg-transparent py-1 text-base text-ink-1 outline-none placeholder:text-ink-3"
              />
            </div>
            <Command.List className="max-h-60 overflow-y-auto py-1">
              <Command.Empty className="px-3 py-2 text-sm text-ink-3">{emptyText}</Command.Empty>
              {options.map((o) => (
                <Command.Item
                  key={o.value}
                  value={o.label}
                  disabled={o.disabled}
                  onSelect={() => {
                    onChange(o.value === value ? null : o.value);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-base text-ink-1 data-[selected=true]:bg-surface-2 data-[disabled=true]:opacity-50"
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <span className="text-jci-blue">{Icon.check({ s: 16 })}</span>}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
```

- [ ] **Step 2: Add the barrel export**

In `packages/ui/src/index.ts`, after the `Popover` export, add:

```ts
export { Combobox, type ComboboxOption } from "./components/combobox";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @luminova/ui run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/combobox.tsx packages/ui/src/index.ts
git commit -m "feat(ui): E1 Combobox (single-select + search)"
```

---

### Task 3: `multi-select.ts` pure helpers (TDD)

**Files:**
- Create: `packages/ui/src/components/multi-select.ts`
- Test: `packages/ui/src/components/multi-select.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/components/multi-select.test.ts
import { describe, expect, it } from "vitest";
import { removeValue, selectedOptions, toggleValue } from "./multi-select";
import type { ComboboxOption } from "./combobox";

const OPTS: ComboboxOption[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

describe("toggleValue", () => {
  it("adds an absent value", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
  });
  it("removes a present value", () => {
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("removeValue", () => {
  it("drops the value, leaving the rest in order", () => {
    expect(removeValue(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
  it("is a no-op when absent", () => {
    expect(removeValue(["a"], "z")).toEqual(["a"]);
  });
});

describe("selectedOptions", () => {
  it("returns the option objects for the selected values, in options order", () => {
    expect(selectedOptions(OPTS, ["c", "a"]).map((o) => o.value)).toEqual(["a", "c"]);
  });
  it("returns empty for no selection", () => {
    expect(selectedOptions(OPTS, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/ui exec vitest run src/components/multi-select.test.ts`
Expected: FAIL — cannot resolve `./multi-select`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/ui/src/components/multi-select.ts
import type { ComboboxOption } from "./combobox";

export function toggleValue(values: string[], v: string): string[] {
  return values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
}

export function removeValue(values: string[], v: string): string[] {
  return values.filter((x) => x !== v);
}

export function selectedOptions(options: ComboboxOption[], values: string[]): ComboboxOption[] {
  return options.filter((o) => values.includes(o.value));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/ui exec vitest run src/components/multi-select.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/multi-select.ts packages/ui/src/components/multi-select.test.ts
git commit -m "feat(ui): multi-select pure helpers (toggle/remove/selected)"
```

---

### Task 4: E2 `MultiSelect` (multi + search + chips)

**Files:**
- Create: `packages/ui/src/components/multi-select-field.tsx`
- Modify: `packages/ui/src/index.ts` (add export)

(Note: the component file is `multi-select-field.tsx`, NOT `multi-select.tsx`, to avoid the `.ts`/`.tsx` bundler-resolution collision the project hit before — `./multi-select` already resolves to the helpers `.ts`.)

- [ ] **Step 1: Write the component**

```tsx
// packages/ui/src/components/multi-select-field.tsx
import { useState } from "react";
import { Command } from "cmdk";
import * as RadixPopover from "@radix-ui/react-popover";
import { cn } from "../lib/cn";
import { fieldControlClasses } from "./input";
import { Icon } from "./icons";
import type { ComboboxOption } from "./combobox";
import { removeValue, selectedOptions, toggleValue } from "./multi-select";

interface MultiSelectProps {
  options: ComboboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
}

/** Multi-select + search on Radix Popover + cmdk; selected render as removable chips. */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  emptyText = "Sin resultados",
  disabled,
  id,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const chosen = selectedOptions(options, value);

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            fieldControlClasses,
            "flex min-h-[52px] flex-wrap items-center gap-1.5 text-left disabled:opacity-60",
          )}
        >
          {chosen.length === 0 && <span className="text-ink-3">{placeholder}</span>}
          {chosen.map((o) => (
            <span
              key={o.value}
              className="inline-flex items-center gap-1 rounded-pill bg-surface-2 py-1 pl-2.5 pr-1.5 text-sm text-ink-1"
            >
              {o.label}
              <span
                role="button"
                aria-label={`Quitar ${o.label}`}
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(removeValue(value, o.value));
                }}
                className="grid size-4 place-items-center rounded-full text-ink-2 hover:bg-line hover:text-ink-1"
              >
                {Icon.close({ s: 12 })}
              </span>
            </span>
          ))}
          <span className="ml-auto shrink-0 text-ink-2">{Icon.chevExpand({ s: 16 })}</span>
        </button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-card border border-line bg-surface p-1 shadow-[0_24px_64px_-24px_rgba(19,15,45,0.4)]"
        >
          <Command className="flex flex-col gap-1">
            <div className="flex items-center gap-2 border-b border-line px-2 pb-2 pt-1 text-ink-2">
              {Icon.search({ s: 16 })}
              <Command.Input
                placeholder={searchPlaceholder}
                className="w-full bg-transparent py-1 text-base text-ink-1 outline-none placeholder:text-ink-3"
              />
            </div>
            <Command.List className="max-h-60 overflow-y-auto py-1">
              <Command.Empty className="px-3 py-2 text-sm text-ink-3">{emptyText}</Command.Empty>
              {options.map((o) => {
                const checked = value.includes(o.value);
                return (
                  <Command.Item
                    key={o.value}
                    value={o.label}
                    disabled={o.disabled}
                    onSelect={() => onChange(toggleValue(value, o.value))}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-base text-ink-1 data-[selected=true]:bg-surface-2 data-[disabled=true]:opacity-50"
                  >
                    <span className="truncate">{o.label}</span>
                    {checked && <span className="text-jci-blue">{Icon.check({ s: 16 })}</span>}
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
```

- [ ] **Step 2: Add the barrel export**

In `packages/ui/src/index.ts`, after the `Combobox` export, add:

```ts
export { MultiSelect } from "./components/multi-select-field";
```

- [ ] **Step 3: Typecheck + helper tests**

Run: `pnpm --filter @luminova/ui run ci`
Expected: PASS (eslint + tsc + vitest, including the 6 multi-select helper tests).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/multi-select-field.tsx packages/ui/src/index.ts
git commit -m "feat(ui): E2 MultiSelect (multi + search + chips)"
```

---

### Task 5: Backstage render tests (prove the widgets in jsdom)

**Files:**
- Create: `apps/backstage/src/features/_widgets/combobox.test.tsx`
- Create: `apps/backstage/src/features/_widgets/multi-select.test.tsx`
- Possibly modify: `apps/backstage/src/test/setup.ts` (cmdk jsdom stubs — only if needed)

(`_widgets` is a non-route throwaway folder for cross-cutting ui smoke tests; the leading `_` keeps the TanStack router plugin from treating it as a route.)

- [ ] **Step 1: Write the Combobox render test**

```tsx
// apps/backstage/src/features/_widgets/combobox.test.tsx
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox, type ComboboxOption } from "@luminova/ui";

const OPTS: ComboboxOption[] = [
  { value: "p1", label: "Programa Alpha" },
  { value: "p2", label: "Programa Beta" },
];

function Harness() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <>
      <Combobox options={OPTS} value={value} onChange={setValue} placeholder="Elegir programa" />
      <output data-testid="val">{value ?? "none"}</output>
    </>
  );
}

describe("Combobox", () => {
  it("opens, filters by search, and selects an option", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText("Elegir programa")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /elegir programa/i }));
    await user.type(screen.getByPlaceholderText("Buscar…"), "Beta");

    expect(screen.queryByText("Programa Alpha")).not.toBeInTheDocument();
    await user.click(screen.getByText("Programa Beta"));

    expect(screen.getByTestId("val")).toHaveTextContent("p2");
  });
});
```

- [ ] **Step 2: Run it — expect cmdk jsdom errors first**

Run: `pnpm --filter backstage exec vitest run src/features/_widgets/combobox.test.tsx`
Expected: FAIL — likely a `scrollIntoView is not a function` / `ResizeObserver is not defined` error from cmdk/Radix in jsdom (or PASS if the environment already polyfills them).

- [ ] **Step 3: Add jsdom stubs only if Step 2 errored on them**

If (and only if) Step 2 failed with `scrollIntoView`/`ResizeObserver`/`PointerEvent` errors, append to `apps/backstage/src/test/setup.ts`:

```ts
// cmdk/Radix rely on a few APIs jsdom lacks.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// Radix Popover dismiss layer uses PointerEvent APIs jsdom omits.
if (!("hasPointerCapture" in Element.prototype)) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
```

Re-run Step 2's command until it passes. If a different failure appears, invoke `superpowers:systematic-debugging` rather than guessing.

- [ ] **Step 4: Write the MultiSelect render test**

```tsx
// apps/backstage/src/features/_widgets/multi-select.test.tsx
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MultiSelect, type ComboboxOption } from "@luminova/ui";

const OPTS: ComboboxOption[] = [
  { value: "m1", label: "Ana Rivas" },
  { value: "m2", label: "Bruno Paz" },
  { value: "m3", label: "Carla Soto" },
];

function Harness() {
  const [value, setValue] = useState<string[]>([]);
  return (
    <>
      <MultiSelect options={OPTS} value={value} onChange={setValue} placeholder="Elegir equipo" />
      <output data-testid="val">{value.join(",") || "none"}</output>
    </>
  );
}

describe("MultiSelect", () => {
  it("selects multiple options and removes one via its chip", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /elegir equipo/i }));
    await user.click(screen.getByText("Ana Rivas"));
    await user.click(screen.getByText("Carla Soto"));
    expect(screen.getByTestId("val")).toHaveTextContent("m1,m3");

    await user.click(screen.getByRole("button", { name: /quitar ana rivas/i }));
    expect(screen.getByTestId("val")).toHaveTextContent("m3");
  });
});
```

Note `MultiSelect` re-exports `ComboboxOption` via the barrel — the import in this test comes from `@luminova/ui` (which exports both `MultiSelect` and `ComboboxOption`).

- [ ] **Step 5: Run both widget tests**

Run: `pnpm --filter backstage exec vitest run src/features/_widgets`
Expected: PASS (2 files, 2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/backstage/src/features/_widgets apps/backstage/src/test/setup.ts
git commit -m "test(backstage): render tests for Combobox + MultiSelect"
```

---

### Task 6: Full verification, reviews, PR

**Files:** none (verification + integration).

- [ ] **Step 1: Package CIs**

Run: `pnpm --filter @luminova/ui run ci && pnpm --filter backstage run ci`
Expected: both PASS.

- [ ] **Step 2: Format + knip + full pr-tests**

Run: `pnpm pr-tests`
Expected: PASS. If knip flags `Popover`/`Combobox`/`MultiSelect`/`ComboboxOption` as unused exports — they ARE consumed only by the backstage tests in this slice (D1 wires the app usage). The render tests import all three from `@luminova/ui`, so knip should see them used. If knip still flags `ComboboxOption` (type-only), confirm the MultiSelect test imports it; otherwise accept + note (it lands as a real consumer in D1).

- [ ] **Step 3: bundle-budget-watcher**

Dispatch the `bundle-budget-watcher` subagent (new eager-bundle deps: popover + cmdk). Confirm no budget breach and that the widgets did not bloat the main chunk unexpectedly. Note: no `/security-review` — this slice touches no auth, Firestore rules, or Cloud Functions.

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin feat/ui-combobox-popover
gh pr create --title "feat(ui): E5 Popover + E1 Combobox + E2 Multi-select" --body "$(cat <<'EOF'
## Summary
- Add `Popover` (E5, Radix), `Combobox` (E1, single-select + search), and `MultiSelect` (E2, multi + chips) to `@luminova/ui`, backed by `@radix-ui/react-popover` + `cmdk`.
- Pure multi-select helpers unit-tested in the ui package; DOM behavior proven by backstage render tests.
- Unblocks D1 (Events/Activities parent picker + roster selects), and seeds E3 ⌘K / table filtering later.

## Test plan
- [ ] ui-ci + backstage-ci pass
- [ ] /security-review run (N/A — no auth/rules/functions touched)
EOF
)"
```

- [ ] **Step 5: Run pr-tests locally (hook reminder)**

Run: `pnpm pr-tests`
Expected: PASS.

---

## Self-review

- **Spec coverage:** Popover (Task 1) ✓, Combobox + ComboboxOption (Task 2) ✓, multi-select pure helpers + tests (Task 3) ✓, MultiSelect chips (Task 4) ✓, backstage render tests + cmdk jsdom caveat (Task 5) ✓, ui pure-test placement + bundle-budget-watcher + no-security-review (Task 6) ✓. Deferred items (E3, maxChips, generic options) correctly absent.
- **Type consistency:** `ComboboxOption` defined in `combobox.tsx` (Task 2), imported type-only by `multi-select.ts` (Task 3) and `multi-select-field.tsx` (Task 4) and re-exported from the barrel for the backstage test (Task 5). Helper names `toggleValue`/`removeValue`/`selectedOptions` consistent across Tasks 3–4. Component file named `multi-select-field.tsx` to avoid the `.ts`/`.tsx` `./multi-select` collision — called out explicitly.
- **Placeholders:** none — every step has real code/commands. The one conditional (Task 5 Step 3 jsdom stubs) is explicit about when to apply and what to do otherwise.
- **Ordering:** Combobox (Task 2) precedes the helper task (Task 3) so `ComboboxOption` exists when the helper test imports it — deliberate, avoids a spurious TDD failure.
