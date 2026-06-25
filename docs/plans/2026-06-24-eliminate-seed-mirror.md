# Follow-up: eliminate the plain-Node role→perms mirror

**Status:** proposed (not started).
**Context:** `tools/scripts/lib/role-seed.mjs` hand-mirrors `BUILT_IN_ROLE_PERMS` /
`ROLE_LABELS` from `packages/types/src/role-definition.ts`. The mirror exists only because
the `tools/scripts/*.mjs` seeds run in raw Node (invoked as `node tools/scripts/…`) and
can't resolve workspace packages. A drift guard
(`packages/types/src/role-definition.mirror.test.ts`) keeps it honest, but the duplication
itself is avoidable.

## Why it's avoidable

`apps/beacon/scripts/seed-roles.ts` already imports the canonical sources directly
(`@luminova/auth/perms`, `@luminova/types/role-definition`) — because it runs through the
workspace's TS toolchain. The `tools/scripts` seeds could do the same if they ran via `tsx`
(or as built TS) instead of raw `node` on `.mjs`.

## Proposed change

- Convert `tools/scripts/seed-emulator`, `seed-production`, and the `lib/*` helpers from
  `.mjs` to `.ts`, run via `tsx` (add as a dev dependency — vet with `secure-dep-vetting`).
- Replace `role-seed.mjs`'s hand-copied `BUILT_IN_ROLE_PERMS` / `ROLE_LABELS` / `permsForRoles`
  with imports of the canonical `@luminova/types/role-definition` + `@luminova/auth/perms`
  (`resolveEffectivePerms`) — deleting the mirror and the drift guard with it.
- Update `package.json` seed scripts and the CI `test:seed` runner accordingly.

## Trade-offs

- Removes the last role→perms mirror and an entire category of drift risk.
- Cost: a `tsx` dev dependency + a small toolchain change to the seed entry points; the
  rules-test contract import would point at the compiled/`tsx`-run module rather than a
  raw `.mjs`.
- Not urgent — the drift guard already makes the mirror safe; do this when next touching
  the seed toolchain.
