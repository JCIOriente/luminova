# @luminova/ui — Claude Code Guide

## Purpose

Shared UI component library using shadcn/ui. All components are copied into this package and shared across `apps/backstage` and `apps/spotlight`.

## Adding Components

Run from `packages/ui` directory:
```bash
pnpm dlx shadcn@latest add <component-name>
```

Examples:
```bash
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add sheet
pnpm dlx shadcn@latest add table
pnpm dlx shadcn@latest add form
pnpm dlx shadcn@latest add combobox
```

## Structure

```
packages/ui/
├── components.json          ← shadcn config (aliases, style, etc.)
├── src/
│   ├── components/          ← all shadcn-generated components
│   │   ├── ui/
│   │   │   ├── button.tsx
│   │   │   ├── sheet.tsx
│   │   │   └── ...
│   └── index.ts             ← re-export everything
```

## Exports

All components exported from `src/index.ts`:
```ts
export * from './components/ui/button'
export * from './components/ui/sheet'
// etc.
```

Apps import as:
```ts
import { Button, Sheet, SheetContent } from '@luminova/ui'
```

## Rules

- **Do not modify shadcn internals** — if you need custom behavior, wrap the component in the consuming app
- **Do not hand-write components** that shadcn provides — always use `shadcn add` first
- Custom non-shadcn components (e.g., `MemberSelector`, `DateRangePicker`) go in `src/components/custom/`
- Tailwind config lives in `packages/ui` — apps extend it via workspace reference

## Components Needed for Backstage

- button, input, label, form
- sheet (for add/edit forms)
- table
- select, combobox
- dialog (for confirmations)
- badge, separator, spinner
- toast, toaster
- tabs (for grouped content)
- card (for dashboard)
- popover, command (for combobox/multi-select)
- radio-group (for scope selection)
- textarea

## Harness

- **Toolchain.** Node 24, pnpm, React 19, TS 5.7 strict, Tailwind v4, Radix UI. Built as a workspace library consumed by `apps/spotlight` + `apps/backstage`.
- **CI gate.** `ui-ci` = prettier-check → eslint → tsc → vitest → knip (unused exports). Run via `pnpm --filter @luminova/ui run ci` (rolled into `pnpm pr-tests`). Use `run ci` — bare `pnpm ci` is pnpm's reinstall builtin.
- **Invariants.** Do not modify shadcn internals — wrap in consuming app. Custom components in `src/components/custom/`. Components re-exported from `src/index.ts`.
- **Heaviest skills.** `react-best-practices` (auto), `ui-ux-pro-max` (component-level a11y). Dispatch `bundle-budget-watcher` on export surface growth.
