# Backstage — Claude Code Guide

Admin dashboard (auth required everywhere except `/login` and `/invitacion`).

## Routing

- File-based, `src/routes/`. `_app.*` = protected sidebar layout; `_auth.*` = public auth layout (pathless).
- Route files export only `Route`, enforced by `ROUTE_EXPORT_SELECTORS` (`no-restricted-syntax`) in `eslint.config.js`; components go in `features/<name>/components/`.

## Route Guard Pattern

- Auth guard lives in `_app.tsx` `beforeLoad` (awaits `context.auth.ready`, `authRedirect` → `/login`, then `canAccessRoute` from `components/nav-config.ts`). Child routes inherit it — never re-check auth inside a component.
- Login: `lib/auth/sign-in.ts`; logout: `lib/auth/sign-out.ts` → `/login`.

## Feature Folder Structure

`src/features/<name>/` with `components/`, `hooks/` (TanStack Query, one hook per file), `repositories/` (Firestore access), `types/` (Zod schemas + inferred types).

No `index.ts` barrels — import directly from the file (`'../repositories/member-repository'`, not `'../repositories'`).

## Repository Pattern

- One class per Firestore collection. Lone exception: `InitiativeRepository` serves `programs` + `projects` (identical `InitiativeCore` schema; takes `type` in its constructor, resolves the collection from `INITIATIVE_CONFIG`). Fold two collections onto one class only when schema and access pattern are identical.
- Shape: `private collection = collection(getDb(), '<name>')`; `getAll`, `getById`, `create`, `update`, `softDelete` (sets `deletedAt: Timestamp` + `active: false`).

## Firestore Data Access

Repositories and media hooks import the service subpath, never the `@luminova/firebase` barrel:

```ts
import { getDb } from "@luminova/firebase/db"; // also /storage, /functions
```

firestore/storage/functions must stay lazy inside feature route chunks — the login path loads only Firebase auth + App Check.

## TanStack Query Conventions

- Keys: `const memberKeys = { all: ['members'] as const, detail: (id) => ['members', id] as const }`.
- Lists: `useQuery({ queryKey, queryFn: () => new XRepository().getAll() })`.
- Writes: `useMutation` + `queryClient.invalidateQueries({ queryKey: xKeys.all })` in `onSuccess`.

## Form Pattern

Every form = React Hook Form + Zod: schema in `types/<name>-schema.ts` exporting `type XInput = z.infer<typeof xSchema>`; `useForm<XInput>({ resolver: zodResolver(xSchema), defaultValues })`.

Gotchas:

- The auth store emits `authenticated` with `EMPTY_CLAIMS` first and the decoded claims later. Never derive a default from claims at mount; re-derive on open/change (e.g. `useEffect([open, isAdmin])`).
- A disabled query is `isPending` with `fetchStatus === "idle"` and `isLoading` false — derive "no access" from that, never from a second copy of the `enabled` gate, or the view shows a false empty state.
- `serverTimestamp()` is rejected inside arrays (e.g. `photos[]`); use `Timestamp.now()` for array-element timestamps.
- Keep zod `.default()` out of form schemas (input ≠ output type breaks `zodResolver` with `useForm<Output>`); put defaults in `defaultValues`.

## UI Patterns

- Forms render in a **Sheet**, not a Dialog.
- Members: soft delete only (never hard delete); client-side table pagination (8/page, options 8/16/32); server-side pagination stays deferred (see `packages/ui/CLAUDE.md`).
- Single member select (director) = Combobox; coDirectors/collaborators/participants = multi-select with search.
- `parentId` shown only when event type = `Activity`.

## Harness

- **CI gate.** `pnpm --filter backstage run ci` = eslint → tsc → vitest (rolled into `pnpm pr-tests`). Bundle budget enforced by `tools/scripts/check-bundle-budget.sh` (CI `checks` job).
- **Sensitive surfaces → REQUIRE `/security-review` + `firestore-security-reviewer`.** Auth flow (`_auth.login`, `_app.tsx` guard), every `repositories/*` Firestore access, any change to `firestore.rules`.
- **Performance.** Budget: eager JS (entry + modulepreloads) ≤ 162 kB gz, CSS ≤ 15 kB gz (current figures in `docs/performance.md`). Renders in `system-ui` on purpose — **do not add a webfont**. `index.html` preconnects the auth/Firestore/Storage origins. Follow `docs/performance.md`; dispatch `bundle-budget-watcher` after dep/route changes.
