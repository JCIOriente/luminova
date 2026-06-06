# F2 — `@luminova/types` package — Design

_Date: 2026-06-06 · Branch: `feat/luminova-types` · Roadmap item: F2_

## Goal

Create `@luminova/types`, a BUILT shared package (emits `dist/`, like
`@luminova/auth`), and promote the **shipped, stable** domain types into it so
apps and (eventually) beacon share one source of truth. Rewire `apps/backstage`
to import from the package. Promote-and-share only — do **not** speculatively
model unshipped engine/finance entities.

## Scope decisions (locked in brainstorming)

1. **Promote shipped only** — `Member` / `MemberStatus` + `Ally` (the in-use
   types) and their zod form schemas. Engine entities (`Program`, `Project`,
   `Activity`, `Participation`, `PointRule`) and finance entities (`DuesConfig`,
   `Payment`) are deferred to F3 / the Finance track, where their shapes are
   designed.
2. **Types + Zod schemas together** — the package ships both the persisted
   interfaces and the zod form schemas (one import location, not split into a
   separate `/schemas` namespace). `z.infer` gives the form-input types
   (`MemberInput` / `AllyInput`); the persisted interfaces (`Member` / `Ally`,
   which carry `Timestamp`, `id`, system fields) are hand-authored alongside —
   they cannot be derived from the form schema.
3. **Rename now:** `ally.personInCharge → contactPerson`. **Defer:**
   `member.status → membershipStatus` (renames only when `duesStatus` coexists,
   per roadmap — that's F3/Finance).
4. **Defer I1** (codegen-drift CI gate) — these are hand-authored types; the gate
   earns its keep once types are generated/derived and consumed cross-boundary.

## Package structure

```
packages/types/
  package.json        # name @luminova/types, type:module, build=tsc, ci=eslint+tsc+vitest
  tsconfig.json       # extends ../../tsconfig.base.json, outDir dist, rootDir src, exclude *.test.ts
  src/
    member.ts         # PURE: MEMBER_STATUSES, MemberStatus, Member (persisted interface)
    member-schema.ts  # zod: memberSchema, MemberInput (imports MEMBER_STATUSES from ./member)
    ally.ts           # PURE: Ally (persisted interface, contactPerson)
    ally-schema.ts    # zod: allySchema, AllyInput (contactPerson)
    member-schema.test.ts  # moved from backstage
    ally-schema.test.ts    # moved from backstage
    index.ts          # barrel re-export — the single public entrypoint
```

### `package.json` (mirrors `@luminova/auth`)

- `exports`: `"."` → `{ types: "./src/index.ts", import: "./dist/index.js", default: "./dist/index.js" }`
- `scripts`: `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run --passWithNoTests`),
  `build` (`tsc`), `ci` (eslint + tsc --noEmit + vitest run).
- `dependencies`: `zod` (exact-pinned per CLAUDE.md security-critical rule;
  match the version already resolved in the workspace — emitted into `dist`).
- `devDependencies`: `firebase` (type-only `Timestamp`; erased at build, so not a
  runtime dep — consumers bring their own `firebase`).

Turbo `^build` already builds package dependencies before dependents, so backstage
builds will produce `@luminova/types`'s `dist/` first. CI per package runs
typecheck/lint/test (not build), same as `@luminova/auth`.

## Public surface

A single root entrypoint, `@luminova/types`, re-exporting everything via
`src/index.ts`:

```ts
export type { Member, MemberStatus } from "./member";
export { MEMBER_STATUSES } from "./member";
export { memberSchema, type MemberInput } from "./member-schema";
export type { Ally } from "./ally";
export { allySchema, type AllyInput } from "./ally-schema";
```

Backstage's four local specifiers (`../types/member`, `../types/member-schema`,
`../types/ally`, `../types/ally-schema`) all collapse to `@luminova/types`.

## Beacon-safety insurance (do now, free)

`MEMBER_STATUSES` ownership flips: today it lives in `member-schema.ts` and
`member.ts` type-imports it. We invert it — the const moves **into** the pure
`member.ts`, and `member-schema.ts` imports it as a value. Result: `member.ts`
and `ally.ts` carry **zero framework runtime** (only a type-only `firebase`
import, erased at build). They emit self-contained `.js`.

When A2 (`awardPoints` in beacon) needs `Member`, we add a pure subpath export
`@luminova/types/member` pointing at the already-pure file — **no refactor**,
because purity was preserved from day one. For F2, backstage keeps importing
everything from the `@luminova/types` barrel.

This mirrors the F1 gotchas: type-only cross-file imports so emitted `.js` stays
self-contained; keep a framework-free entrypoint available for beacon.

## Rename: `personInCharge → contactPerson`

Touches 9 files in `apps/backstage`: `types/ally.ts`, `types/ally-schema.ts`,
`types/ally-schema.test.ts`, `repositories/ally-mapper.ts`,
`components/ally-form.tsx`, `components/ally-table.tsx`,
`components/ally-table.test.tsx`, `components/ally-form.test.tsx`,
`routes/_app.allies.tsx`. The user-facing Spanish label ("Encargado") is
unchanged — only the English identifier changes. Firestore field name on existing
docs is out of scope (no live prod ally data depends on it; mapper writes the new
field going forward — note for any future backfill).

## Rewire plan

1. Create `packages/types` with the moved + renamed files.
2. Delete `apps/backstage/src/features/members/types/*` and
   `apps/backstage/src/features/allies/types/*`.
3. Repoint the ~21 import sites to `@luminova/types`.
4. Add `"@luminova/types": "workspace:*"` to `apps/backstage/package.json`.
5. Add `@luminova/types` entrypoints to the knip config (as `@luminova/auth` got),
   so the unused-export check passes.
6. Update `docs/data-models.md` (ally `contactPerson`) and roadmap F2 row → done.

## Testing

- The two schema tests move with the schemas into the package (vitest, node env —
  pure validation, no DOM).
- The `contactPerson` rename is done test-first: update the affected tests to the
  new identifier (red), then rename the code (green).
- Component / mapper / repository tests stay in backstage and must still pass
  against the new imports.
- Verify: `pnpm --filter @luminova/types run ci`, `pnpm --filter backstage run ci`,
  `pnpm pr-tests`.

## Out of scope / deferred

- Engine + finance entities → F3 / Finance track.
- `member.status → membershipStatus` rename → when `duesStatus` lands.
- I1 codegen-drift CI gate.
- Beacon-safe subpath export → A2 (`awardPoints`).
- No auth / Firestore rules / Cloud Functions changes → no `/security-review`
  trigger. No new third-party deps → `secure-dep-vetting` not triggered (`zod`
  and `firebase` already in the tree).
