# E5 Popover + E1 Combobox + E2 Multi-select — design

_Date: 2026-06-06 · Package: `@luminova/ui` · Branch: `feat/ui-combobox-popover`_

## Goal

Ship the three `@luminova/ui` widgets D1 (Events/Activities CRUD) needs for its
real forms — a single-select searchable **Combobox** (program/project parent
picker) and a searchable **Multi-select** (director/co-director/participant
rosters) — both built on a shared **Popover** primitive. Clean reusable slice,
its own PR, landed **before** `feat/events-crud`. Also seeds FX3 (⌘K) and table
filtering later.

## Decisions (locked in brainstorm)

- **Backing libs:** `@radix-ui/react-popover` (E5) + `cmdk` (filtering + keyboard
  nav inside E1/E2). cmdk is the shadcn-standard command primitive and directly
  seeds E3 (⌘K palette / FX3) later. Both vetted via `secure-dep-vetting` before
  the dep edit.
- **House style:** Radix/cmdk primitive wrapped, styled with JCI tokens, controlled
  props — mirrors the existing `Dialog`/`Tooltip` wrappers, not shadcn's separate
  theme-var system. Token surface = `bg-surface rounded-card` + the shared shadow.
- **Concrete option shape**, not generic: `{ value: string; label: string;
  disabled?: boolean }`. Backstage selects entity ids → label, so string-keyed
  options fit; no generic `<T>` complexity.
- **Barrel-exported** (not deep-imported): Radix popover + cmdk are light (no heavy
  media libs like qr-*), so they ride the eager bundle. `bundle-budget-watcher`
  confirms after.

## Components

All in `packages/ui/src/components/`, raw-TS (no build step), token-styled.

### E5 `Popover`
Thin wrapper over `@radix-ui/react-popover` (Root/Trigger/Portal/Content).

```ts
interface PopoverProps {
  trigger: ReactNode;            // rendered inside Trigger asChild
  children: ReactNode;           // content body
  open?: boolean;                // controlled-optional
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";   // default "start"
  side?: "top" | "right" | "bottom" | "left"; // default "bottom"
  contentClassName?: string;
}
```
Content surface: `z-50 rounded-card bg-surface p-1 shadow-[...]` + Radix
`sideOffset`. The shared primitive E1/E2 (and later menus/E3) mount into.

### E1 `Combobox` (single-select + search)
`Popover` wrapping a cmdk `Command` (`Command.Input` + `Command.List` +
`Command.Empty` + `Command.Item`s).

```ts
type ComboboxOption = { value: string; label: string; disabled?: boolean };
interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;          // trigger text when empty
  searchPlaceholder?: string;
  emptyText?: string;            // default "Sin resultados"
  disabled?: boolean;
  id?: string;                   // Field/RHF wiring
}
```
- Trigger = a `button` styled with `fieldControlClasses` + the `Select` chevron
  (visual parity with the native `Select`). Shows the selected option's label or
  the placeholder.
- Selecting an item sets `value` and closes; re-selecting the active item toggles
  it back to `null` (clear). No separate clear affordance in v1.
- Selected item shows a check icon.

### E2 `MultiSelect` (multi + search)
Same `Popover` + cmdk body; multi semantics.

```ts
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
```
- Trigger renders selected options as removable **chips** (Badge-like pills with
  an × button, `aria-label` per chip) or the placeholder when empty. Popover stays
  open across toggles (multi-pick).
- Each list item shows a checkbox-style selected state.
- `maxChips` / "+N" collapse — **deferred** (YAGNI).

## Pure logic extraction (testable in the ui package)

The ui package runs **pure `.ts` tests only** (no jsdom — sparkline/line-chart
precedent). Extract the array logic so it's unit-tested here:

`packages/ui/src/components/multi-select.ts`
- `toggleValue(values: string[], v: string): string[]`
- `removeValue(values: string[], v: string): string[]`
- `selectedOptions(options: ComboboxOption[], values: string[]): ComboboxOption[]`

Combobox selection is trivial set/clear — no helper worth extracting; logic inline.

## Testing

- **Pure helpers** (`multi-select.ts`) → vitest in `@luminova/ui` (`multi-select.test.ts`).
- **Component/DOM behavior** (open on click, type-to-filter, keyboard select, chip
  removal) → **backstage** (jsdom + RTL already set up). A small
  `Combobox`/`MultiSelect` render+interact test ships in **this** slice so the
  widgets are independently proven, not deferred to D1.
- **cmdk jsdom caveat:** cmdk touches `scrollIntoView`/`ResizeObserver`; jsdom may
  need stubs in backstage `src/test/setup.ts`. Add only if the render tests need
  them (systematic-debugging if they fight back).

## Out of scope / deferred

- E3 command-palette primitive + FX3 ⌘K (cmdk now seeds it).
- E6 DataTable / FX1 table filtering (separate).
- `maxChips`/"+N" chip collapse, async option loading, generic `<T>` options.
- Any backstage feature wiring — that's `feat/events-crud` (D1).

## Verification

- `pnpm --filter @luminova/ui run ci` (eslint + tsc + the helper tests).
- `pnpm --filter backstage run ci` (the render tests).
- `secure-dep-vetting` before the dep edit (latest secure, Node 24, CVE gate).
- `bundle-budget-watcher` after (new eager-bundle deps).
- `pnpm pr-tests` (format + all-ci + knip) before PR.
