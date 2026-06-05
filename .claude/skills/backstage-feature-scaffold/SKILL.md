---
name: backstage-feature-scaffold
description: >-
  Scaffold a new admin CRUD feature in apps/backstage following the repo's
  repository + TanStack Query + React Hook Form + Zod pattern. Use when the user
  asks to "add a <thing> feature/section/page to backstage", "create a CRUD for
  <collection>", "scaffold members/events/allies/point-rules", "wire up a new
  Firestore collection in the admin", or "add an admin table for <X>". Produces
  the feature folder (types, repositories, hooks, components) and the protected
  route. Do NOT use for spotlight (no Firestore) or beacon (functions). Honor
  prompt-refine first for the field list.
---

# backstage-feature-scaffold

Scaffold one admin feature consistent with `apps/backstage/CLAUDE.md`. Read that
file's patterns before generating — this skill is the procedure, that file is the
source of truth for conventions.

## Prerequisites

- Confirm the **collection name** (Firestore), the **field list + types**, and
  whether the entity is **soft-deletable** (members are; others may hard-delete).
- If new shared types are involved, decide whether they belong in
  `@luminova/types` (cross-app) or stay local to the feature.

## Layout to create

`apps/backstage/src/features/<name>/` — **no barrel files**, import direct:

```
features/<name>/
  types/<name>-schema.ts        ← Zod schema + inferred type
  repositories/<name>-repository.ts  ← one class, one collection
  hooks/use<Plural>.ts          ← list query
  hooks/useAdd<Singular>.ts     ← create mutation (invalidate on success)
  hooks/useUpdate<Singular>.ts  ← update mutation
  components/<Singular>Table.tsx ← table from @luminova/ui
  components/<Singular>Form.tsx  ← RHF + zodResolver, rendered in a Sheet
```

## Generation rules (match CLAUDE.md exactly)

1. **Schema** — `z.object({...})` in `types/<name>-schema.ts`; export
   `export type <Singular>Input = z.infer<typeof schema>`.
2. **Repository** — class with `private collection = collection(db, '<name>')`;
   methods `getAll`, `getById`, `create`, `update`, and `softDelete` (sets
   `deletedAt: Timestamp` + `active: false`) **only if soft-deletable**. Import
   `db` from `@luminova/firebase`.
3. **Query keys** — `const <name>Keys = { all: ['<name>'] as const, ... }`.
4. **Hooks** — `useQuery` for lists, `useMutation` + `queryClient.invalidateQueries`
   on success for writes. One hook per file.
5. **Form** — `useForm<Input>({ resolver: zodResolver(schema), defaultValues })`,
   rendered inside `<Sheet>` (not Dialog). Use `@luminova/ui` form primitives.
6. **Route** — add `_app.<name>.tsx` under the protected `_app` layout. Auth guard
   is inherited from `_app.tsx` `beforeLoad`; do not re-check in the component.

## After scaffolding

- Run `pnpm --filter backstage run ci`.
- This touches Firestore access → dispatch the `firestore-security-reviewer`
  subagent and run `/security-review` before claiming done.
