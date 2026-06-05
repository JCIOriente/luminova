---
name: prompt-refine
description: >-
  Before executing a non-trivial request, restate it as a refined prompt and
  list the exact tools/files you plan to touch, then wait for confirmation.
  Use when the request touches more than one file, opens a PR, runs a Firebase
  deploy or migration, edits CI/hooks/settings, changes a cross-package contract
  (@luminova/types, repository signatures), or invokes a project skill. Triggers
  on multi-step asks like "add a members feature", "wire up auth", "set up the
  functions trigger", "refactor the repositories". Do NOT use for trivial,
  single-file edits, typo fixes, or pure questions. Bypass entirely when the user
  says "auto", "go", or "just do it".
---

# prompt-refine

Cheap insurance against building the wrong thing. One short round-trip before
non-trivial work.

## When to apply

Apply when **any** of these is true:

- The change touches >1 file.
- It opens a PR (`gh pr create`).
- It runs a Firebase deploy, emulator data change, or schema/data migration.
- It edits CI targets, `.claude/hooks/*`, or `.claude/settings.json`.
- It changes a cross-boundary contract: `@luminova/types`, a repository method
  signature, a Cloud Function trigger shape, or a Zod schema consumed elsewhere.
- It invokes another project skill (`secure-dep-vetting`, `backstage-feature-scaffold`).

Skip for single-file polish, typos, formatting, or answering a question.

## Bypass

If the user's message contains `auto`, `go`, or `just do it`, skip the round-trip
and execute directly.

## The round-trip

Respond with exactly three things, then stop and wait:

1. **Refined prompt** — 1–3 lines restating the goal in concrete terms, naming
   the app/package and the user-visible outcome.
2. **Tool plan** — a numbered list of the concrete steps: files to create/edit,
   skills to invoke, commands to run (`pnpm --filter <pkg> run ci`, etc.).
3. **Proceed question** — one line: "Proceed, or adjust?"

Do not start editing until the user confirms (or had already said a bypass word).

## Example

> **Refined:** Add a read-only Allies table to `apps/backstage` at `/allies`,
> backed by an `AllyRepository`, listing partner name + tier.
>
> **Plan:**
> 1. `apps/backstage/src/features/allies/types/ally-schema.ts` — Zod + type
> 2. `.../repositories/ally-repository.ts` — `getAll()`
> 3. `.../hooks/useAllies.ts` — TanStack Query hook
> 4. `.../components/AllyTable.tsx` — table UI from `@luminova/ui`
> 5. wire route `_app.allies.tsx`
> 6. `pnpm --filter backstage run ci`
>
> Proceed, or adjust?
