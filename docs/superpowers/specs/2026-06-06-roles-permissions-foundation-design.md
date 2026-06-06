# F1 — Roles & Permissions Foundation — Design

_Date: 2026-06-06 · Branch: `feat/roles-permissions` · Roadmap: F1_

## Goal

Build the access-control spine the rest of the platform gates on: a CASL-based
ability model on the client, custom-claim-backed roles, a role-aware
`firestore.rules`, and a trusted backend path to grant roles. Permission role is
**distinct from chapter title**; roles are **additive**; Scanner is
**event-scoped**.

This folds in the deferred rules-hardening (`delete: if false` + `totalPoints`
write-guard).

## Locked decisions (from brainstorming)

1. **Role storage = Firebase Auth custom claims.** Rules read
   `request.auth.token.roles` with zero extra document reads; client decodes the
   ID token. Claims are written only by a trusted backend (beacon callable).
2. **Member↔uid linkage = optional `uid?: string` field on the member doc.**
   Existing random doc IDs are kept (non-destructive to the 2 seeded members).
   Members without an account stay unlinked. Self-access checks
   `resource.data.uid == request.auth.uid`.
3. **F1 scope = full vertical slice.** Read side (ability + guards + rules) **and**
   write side (a beacon `setUserRoles` callable + a first-Admin bootstrap seed
   script). No role-assignment UI — that is D4 (Settings).
4. **Code home = new `packages/auth` (`@luminova/auth`).** Split entrypoints: a
   framework-free `@luminova/auth/roles` (constants + `AuthClaims` + plain
   helpers) that beacon imports, and `@luminova/auth/ability` (the CASL builder)
   that backstage imports. `@casl/ability` is a dependency of `@luminova/auth`
   only; beacon never pulls CASL.

## Dependencies (vetted via secure-dep-vetting)

- `@casl/ability@7.0.0` — pinned **exact** (authorization = security-critical).
- `@casl/react@7.0.0` — pinned **exact**.
- Node 24 compatible (no `engines` restriction). Audit clean at `--audit-level=high`
  (+6 transitives, no high/critical). Both land in `packages/auth`; `@casl/react`
  is re-exported / consumed by backstage.

## Section 1 — The claim contract (`@luminova/auth/roles`)

Framework-free single source of truth. No CASL import.

```ts
export const ROLES = [
  'Admin',
  'Membership',
  'Treasury',
  'ExecutiveCommittee',
  'ProjectManager',
  'Scanner',
  'Member',
] as const

export type Role = (typeof ROLES)[number]

export interface AuthClaims {
  roles: Role[]
  scannerEventIds?: string[] // event IDs this user may check-in; only with 'Scanner'
}
```

- `ExecutiveCommittee` = the CEL persona (acronym expanded per the naming
  convention; English identifier, no diacritics).
- Roles are **additive** — e.g. `['Membership','ExecutiveCommittee']`.
- Plain helpers (framework-free, usable in beacon): `isValidRole(x): x is Role`,
  `hasRole(claims, role): boolean`, `hasAnyRole(claims, roles): boolean`.

## Section 2 — CASL ability model (`@luminova/auth/ability`)

`buildAbility(claims: AuthClaims, uid: string): AppAbility`

- **Subjects:** `Member · Ally · Event · PointRule · MemberPoints · Payment ·
  Attendance · Program · Project · Activity` — forward-declared string subjects so
  later epics drop in without reshaping the ability.
- **Actions:** `manage · create · read · update · delete · checkIn`.

| Role | Abilities |
|---|---|
| **Admin** | `manage all` |
| **Membership** | `manage Member`; `read Ally, Event, MemberPoints` |
| **Treasury** | `manage Payment`; `read Member, MemberPoints` |
| **ExecutiveCommittee** | `read Member, Ally, Event, MemberPoints, Program, Project` (read-only board) |
| **ProjectManager** | `manage Project`; `read Ally, Event` |
| **Scanner** | `checkIn Attendance where eventId ∈ scannerEventIds` (event-scoped) |
| **Member** | `read/update Member where uid == self`; `read MemberPoints, Event, Project` |

`delete` in the ability is the **UI soft-delete affordance**; hard delete is
blocked at the rules layer for every collection regardless of ability.

## Section 3 — Role-aware `firestore.rules`

Rules read claims directly (no extra doc reads). Helpers:

```
function signedIn()     { return request.auth != null; }
function roles()        { return request.auth.token.roles; }
function hasAnyRole(rs) { return signedIn() && roles().hasAny(rs); }
function unchanged(f)   { return request.resource.data[f] == resource.data[f]; }
```

| Collection | read | create / update | delete |
|---|---|---|---|
| `members` | board roles **or** `resource.data.uid == auth.uid` (self) | `Admin`/`Membership`; `totalPoints` & `uid` immutable from client; `totalPoints == 0` on create | `if false` |
| `allies` | `Admin`/`Membership`/`ProjectManager`/`ExecutiveCommittee` | `Admin`/`Membership` | `if false` |
| `events` | `signedIn` | `Admin`/`ExecutiveCommittee`/`ProjectManager` | `if false` |
| `pointRules` | `signedIn` | `Admin` | `if false` |
| `memberPoints` | `signedIn` (public to members per the points matrix) | `if false` (admin-SDK only) | `if false` |
| `projects` / `board` | **public read (unchanged)** | `Admin`/`ProjectManager` | `if false` |
| `{document=**}` | deny | deny | deny |

- "board roles" for `members` read = `['Admin','Membership','Treasury','ExecutiveCommittee']`.
- Folds in deferred follow-up #1 (rules-hardening): `delete: if false` everywhere
  + `totalPoints`/`uid` write-guard on members.
- `projects`/`board` public read is intentionally **left unchanged** (follow-up #2 /
  roadmap G2 — to be confirmed/restricted alongside C1's public projection, not in
  this branch).

Tests extend `tests/firestore-rules`: at least one allow + one deny case per role
per collection, plus the field-immutability guards (totalPoints/uid).

## Section 4 — `setUserRoles` callable + first-Admin bootstrap

Beacon `onCall` (Cloud Functions v2, admin-SDK only, lazy init):

- **Input** (Zod-validated): `{ targetUid: string, roles: Role[], scannerEventIds?: string[] }`.
- **Guard:** caller must be authenticated and `request.auth.token.roles` must
  include `Admin` → otherwise `HttpsError('permission-denied')`.
- **Validate:** every role ∈ `ROLES` (imported from `@luminova/auth/roles`);
  `scannerEventIds` is only accepted when `roles` includes `Scanner`; reject empty
  `targetUid`.
- **Effect:** `getAuth().setCustomUserClaims(targetUid, { roles, scannerEventIds })`.
  **Idempotent** — overwrites the whole claim set (caller sends the desired final
  state, not a delta).
- **Return:** `{ ok: true }`.

**Bootstrap (chicken-and-egg):** a `pnpm seed:roles -- <uid> Admin …` admin-SDK
script, emulator-guarded (refuses to run against prod, mirroring the existing
`seed:emulator` guard via `FIRESTORE_EMULATOR_HOST`). Grants the first Admin
directly so the callable has a first caller. No public self-grant path exists.

**Reviews triggered:** `firebase-functions-reviewer` (callable),
`firestore-security-reviewer` (rules vs access), `/security-review` (rules + auth).

## Section 5 — Backstage integration + testing

- **Auth-store extension:** on each `onAuthStateChanged`, also call
  `user.getIdTokenResult()` and decode `roles`/`scannerEventIds` into
  `AuthState` → `{ status, user, claims }`. An unauthenticated or claimless user
  gets `claims: { roles: [] }`. Force-refresh of claims is **out of scope** for F1
  (claims propagate on the next token refresh / re-login).
- **Router context:** build the `AppAbility` from `claims` + `user.uid` and expose
  it via TanStack Router context alongside the existing auth store.
- **Guards:** `_app.tsx` keeps the signed-in gate. Add an ability-based helper for
  per-action gating; nav items and table row-actions hide what the active role
  cannot do (via `@casl/react`'s `<Can>` or an ability hook). **No hard 403 pages
  in F1** — hide affordances client-side; rules enforce server-side.
- **Testing (TDD):**
  - `roles.ts` — constants + `AuthClaims` shape + helper predicates.
  - `ability.ts` — every role → ability assertion (allow + deny), incl. Member
    self-scope and Scanner event-scope conditions.
  - rules — allow/deny matrix per role per collection + field-immutability guards
    (functions emulator; Java PATH inline).
  - callable — guard rejects non-Admin, validates role names, rejects
    `scannerEventIds` without Scanner, sets claims (functions emulator).
  - auth-store — claim decoding from `getIdTokenResult`.
  - Manual emulator e2e — seed an Admin, grant a Treasury role, verify a Treasury
    user cannot write `members` and an Admin can.

## Out of scope (deferred)

- Role-assignment UI (→ D4 Settings).
- Member self-login wiring / personal QR (→ B1).
- `projects`/`board` public-read restriction (→ G2 / C1).
- Forced claim refresh after a role change mid-session.
- App Check enforcement (→ G4).

## File inventory (anticipated)

- `packages/auth/` — `package.json`, `tsconfig.json`, `src/roles.ts`,
  `src/roles.test.ts`, `src/ability.ts`, `src/ability.test.ts`.
- `firestore.rules` — rewritten role-aware.
- `tests/firestore-rules/` — extended allow/deny matrix.
- `apps/beacon/src/set-user-roles.ts` (+ test) — the callable; export from index.
- `apps/beacon/` seed script for first-Admin bootstrap + `package.json` script.
- `apps/backstage/src/lib/auth/auth-store.ts` — claim decoding (+ test).
- `apps/backstage/src/lib/authz/` — ability-from-context wiring + `<Can>`/hook.
- `apps/backstage` router context + nav/row-action gating.
- `apps/backstage/package.json` — `@casl/react` + `@luminova/auth` deps;
  `packages/auth/package.json` — `@casl/ability`.
</content>
</invoke>
