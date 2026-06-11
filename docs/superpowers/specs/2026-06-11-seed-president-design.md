# Seed an initial President — Design (2026-06-11)

## Problem

The platform has no way to create the **first** privileged user from a clean
slate that survives the claims-sync trigger. Two existing seeds mint an Admin via
custom claims only:

- `seed:emulator` links Admin to member `m1`, but `m1` has **no Presidente
  cargo**. The first member-doc write (e.g. the engine mirroring `totalPoints`,
  since `m1` is a project director) fires `onMemberWritten`, which recomputes
  roles **purely from positions** → Admin is wiped to `Member`.
- `seed:production` mints a system Admin with no member doc. It survives only
  because the trigger never touches a non-member uid — but it is not a real
  president and cannot be the org's first roster member.

We want a **one-time** seed of a real **Presidente** who *is* Admin durably:
fake data for dev, prompted real data for prod.

## Background — title vs permission

A **position** (cargo) is a chapter title; a **role** is a permission. The
`Presidente` position carries `grants: ["Admin"]`. The chain:

```
member assigned cargo "Presidente" → grants ["Admin"]
  → onMemberWritten writes claims roles:["Member","Admin"]
  → firestore.rules + CASL grant full access
```

`firestore.rules`/CASL gate on **roles**, never on titles, so Admin must exist as
its own permission. See `docs/roadmap.md` §"Personas & permissions".

### The durability rule (why order matters)

`syncMemberClaims` honors a power grant (`grants` non-empty) only when the
position's `assignedBy` uid currently holds Admin (`resolveTrustedGrants` reads
the assigner's **live** claims). For a self-assigned first president this is a
cycle: they are not Admin yet, so a positions-only seed drops the grant.

We break the cycle by **setting the claim before writing the member doc**:

1. `setCustomUserClaims(uid, { roles: ["Member","Admin"] })`
2. then write `members/{id}.positions.<term> = { cargoId, comisionIds: [], assignedBy: uid }`

When `onMemberWritten` fires on step 2, `getUserRoles(assignedBy=self)` already
includes Admin → grant honored → Admin persists across all future re-derivations.

## Decisions (locked with user)

1. The seeded login is a **real president-member** (member doc + Presidente cargo
   + QR, appears in `/members`), not a disembodied system admin.
2. **Dev:** fixed fake data; login `admin@jci.cc` / `Secret1`.
3. **Prod:** interactive prompt for the president's real info before seeding. No
   `config.yml` (avoids a committed secret).
4. **Once only:** idempotent guard refuses a second run; `--force` overrides.

## Components

### `tools/scripts/lib/seed-president.mjs` (new — shared core)

Pure-ish helper, env-agnostic (operates on an injected `db` / `auth`). Export:

```js
seedPresident({ db, auth, president: { name, email, password, gender }, term, force })
```

Steps (in order):

1. **Once-guard.** Read `meta/bootstrap`. If it exists and `!force` → throw a
   friendly "already seeded" error.
2. **Ensure CEL positions.** If the `positions` collection is empty, write
   `CEL_SEED`. Resolve the **Presidente** position id = the active CEL entry with
   `grants` containing `"Admin"`. (Fail loudly if none — guards against a drifted
   seed.)
3. **Create/get Auth user** by email (create, or update password if it exists).
4. **Set claims first:** `setCustomUserClaims(uid, { roles: ["Member","Admin"] })`.
5. **Write member doc** with `uid` linked + `positions.<term> = { cargoId:
   presidenteId, comisionIds: [], assignedBy: uid }` and the required member
   fields (status `Activo`, `active: true`, `deletedAt: null`, gender, joinDate,
   birthdate placeholder, etc. matching the current member shape).
6. **Stamp `meta/bootstrap`** = `{ seededAt, presidentUid: uid }`.

`CEL_SEED` lives in `apps/backstage/src/features/positions/lib/cel-seed.ts` (TS).
The `.mjs` scripts cannot import TS directly; mirror the seed as a small
`tools/scripts/lib/cel-seed.mjs` constant (kept in sync — it is just data) OR
inline the Presidente entry. Decision: a `cel-seed.mjs` data mirror with a unit
assertion that it matches the TS source is overkill for this scope; instead
**inline the full CEL list in `cel-seed.mjs`** and add a comment pointing at the
TS source of truth. (Drift risk accepted; CEL cargos are stable.)

### `tools/scripts/seed-emulator.mjs` (modify)

- Promote `m1` (Ana Rivas) to the durable president via `seedPresident`: email
  `admin@jci.cc`, password `Secret1`, gender `Femenino`, `force: true` (dev
  re-seeds freely). This fixes the existing dev Admin-wipe bug.
- Keep the rest of the dev dataset (members, activities, projects, points).

### `tools/scripts/seed-production.mjs` (modify)

- Replace the env-var system-admin with `readline` prompts: **name, email,
  password (masked via muted stdout), gender**. Validate non-empty + email shape
  + password policy (min 6, upper/lower/digit — mirror the app).
- Run `seedPresident({ force: false })`. Keep the existing hard guard against
  emulator env vars. Print "log in, then change the password from Firebase
  console."

## Data flow

```
seed cmd → gather creds (fixed | prompt)
        → seedPresident: once-guard → ensure CEL → auth user
                         → set Admin claims → write president member+cargo
                         → stamp meta/bootstrap
        → (functions deployed) onMemberWritten re-derives → Admin preserved
```

## Error handling

- Once-guard hit → exit 0 with a clear message (not an error; re-runs are
  expected operator behavior).
- Missing Presidente-with-Admin in catalog → throw (catalog drift).
- Auth `email-already-exists` → reuse the user, reset password (dev) / warn
  (prod).
- Prod prompt validation failure → re-prompt the offending field.

## Testing

- **Unit:** export the pure bits of `seedPresident` (Presidente-id resolution
  from a position list, claims computation, member-doc shape builder) and test
  them in `tools/scripts/lib/seed-president.test.mjs` using Node's built-in
  runner (`node --test`) — `tools/` is not a pnpm workspace and there is no root
  vitest, so the zero-dependency built-in runner is the right fit. Wire a root
  `package.json` script `test:seed` (`node --test tools/scripts/lib/`) and add it
  to `pr-tests`.
- **Emulator e2e (manual, controller-run):** run `pnpm seed:emulator`; assert
  (a) login `admin@jci.cc`/`Secret1` works, (b) claims `roles` include `Admin`,
  (c) **after a no-op member-doc re-write** the claims still include `Admin`
  (proves durability), (d) a second `seed:production`-style run without `--force`
  refuses.
- Existing `cel-seed.test.ts` unchanged.

## Security

Sets custom claims = server-side trust boundary. After implementation:
`/security-review` on the diff + `firebase-functions-reviewer` (claims-adjacent
ops script). The once-guard and the "claims-before-member-write" ordering are the
security-critical invariants to review.

## Out of scope

- Seeding additional members/events/initiatives in prod (the president populates
  these from backstage — the whole point).
- The actual prod run (owner-op; requires ADC + real creds).
- A committed `config.yml` (rejected — prompt instead).
- Forcing a token refresh on already-logged-in users (N/A at first seed).
```
