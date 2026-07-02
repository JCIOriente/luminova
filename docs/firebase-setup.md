# Firebase Setup

## Runtime

- **Node 24** for all apps and Cloud Functions
- `.nvmrc` at repo root pins Node version
- `firebase.json` → `functions.runtime: "nodejs24"`
- `apps/beacon/package.json` → `engines.node: "24"`

## Project

Firebase project ID: `jci-oriente`

## Web Apps

Two web app registrations share one Firebase project and one Firestore database:

| App | appId | Hosting target | URL |
|-----|-------|----------------|-----|
| spotlight | `1:953870918238:web:63d0034740735d618b4acf` | `jcioriente` | https://jcioriente.web.app |
| backstage | `1:953870918238:web:acbd53d377846bd88b4acf` | `jcioriente-backstage` | https://jcioriente-backstage.web.app |

Each app reads its Firebase config from its own `apps/<app>/.env.local` (template at `apps/<app>/.env.local.example`). The two apps share the same project and database but use separate app registrations and separate App Check site keys.

## Hosting Targets

| Target | App | URL |
|--------|-----|-----|
| `jcioriente` | spotlight | https://jcioriente.web.app |
| `jcioriente-backstage` | backstage | https://jcioriente-backstage.web.app |

## Initial Setup (one-time)

```bash
# Install Firebase CLI globally (CI/CD pins 15.22.1 — see docs/ci-cd.md; match it locally)
npm install -g firebase-tools@15.22.1

# Login
firebase login

# Set project
firebase use jci-oriente

# Apply hosting targets
firebase target:apply hosting jcioriente jcioriente
firebase target:apply hosting jcioriente-backstage jcioriente-backstage
```

## Environment Variables

### Frontend Apps (apps/spotlight, apps/backstage)

Each app has its own `.env.local` (never commit these). Use the template at `apps/<app>/.env.local.example`:

```bash
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=jci-oriente.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=jci-oriente
VITE_FIREBASE_STORAGE_BUCKET=jci-oriente.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=953870918238
VITE_FIREBASE_APP_ID=<per-app appId from Web Apps table above>
# App Check (reCAPTCHA v3) — paste the real site key once created; blank disables App Check
VITE_APPCHECK_SITE_KEY=
# Per-developer App Check debug token for local dev
VITE_APPCHECK_DEBUG_TOKEN=
VITE_FIREBASE_EMULATOR_ENABLED=false
```

For local development with emulators, set `VITE_FIREBASE_EMULATOR_ENABLED=true`.

### Beacon (apps/beacon)

Cloud Functions use Application Default Credentials — no env file needed.
For local emulator, the Firebase CLI handles credentials automatically.

## App Check

App Check uses **reCAPTCHA v3** to protect the Firebase backend from abuse.

- Setting `VITE_APPCHECK_SITE_KEY` in `.env.local` enables App Check for that app. Leaving it blank disables App Check.
- For local development, copy the debug token printed in the browser console into `VITE_APPCHECK_DEBUG_TOKEN` and register it under Firebase Console → App Check → Apps → Manage debug tokens.
- Enforcement is currently **OFF** and should remain off until real reCAPTCHA v3 site keys are configured for both apps in production.

The `@luminova/firebase` package initializes App Check automatically when `VITE_APPCHECK_SITE_KEY` is set.

## Emulators

### Prerequisites

The Firestore emulator requires a **Java Runtime Environment (JRE)**. On Apple Silicon macOS:

```bash
brew install openjdk
# Add to your shell profile:
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
```

### Start All Emulators

**Daily driver — `pnpm dev`** starts the emulators, seeds them, and runs both app dev
servers (see the README "Run locally — one command"). Under the hood it runs
`tools/scripts/emulators.sh`, which adds Java to PATH, rebuilds the beacon functions `dist`,
and starts the suite with `--import/--export-on-exit ./emulator-data` (state survives
restarts).

To run **only** the emulators (e.g. against an already-built bundle):

```bash
bash tools/scripts/emulators.sh      # wrapped: Java PATH + fresh dist + persisted data
# or the raw CLI (needs Java on PATH yourself, no persistence):
firebase emulators:start
```

| Service | Port | URL |
|---------|------|-----|
| Auth | 4030 | — |
| Firestore | 4010 | — |
| Functions | 4020 | — |
| Hosting | 4000 | http://localhost:4000 |
| Storage | 9199 | — |
| Emulator UI | 4100 | http://localhost:4100 |

### Seeding the Emulator

`pnpm dev` seeds automatically once the emulators are up. To (re-)seed a **running**
emulator on its own:

```bash
pnpm seed:emulator
```

This seeds (project `jci-oriente`, matching `.firebaserc` + `VITE_FIREBASE_PROJECT_ID`):

- **Firestore** — sample members + a Recognition Engine slice (term, activities,
  participations, memberPoints) so the Members, member-profile, and Leaderboard pages
  render real data. (Point rules are left to the UI: "Reglas de puntos" → *Inicializar*.)
- **Auth** — a ready-to-login Presidente (Admin via cargo), its own `president` member:

  | Email | Password | Roles | Perms |
  |-------|----------|-------|-------|
  | `admin@jci.cc` | `Secret1` | Member, Admin | `manage:all` |

Log in to backstage with those credentials and you'll see every (Admin-gated) feature.
Re-running is idempotent.

> **Why the `perms` claim matters.** The Firestore rules gate every read/write on the
> coarse `perms` custom claim (`manage:all` for Admin), not on `roles`. The seed mints
> `perms` on the Auth user up front, so the pages load on first login. A token minted
> **before** this was added carries no `perms` → every list fails closed with "No se
> pudieron cargar los miembros/aliados…". Fix: re-seed (`pnpm seed:emulator`) and sign
> out/in so the app fetches a fresh ID token with the claim.

**Granting roles to other users** (e.g. a Scanner or a second account you created in the
Emulator UI at http://localhost:4100) — this also mints the matching built-in `perms`,
so the account can read immediately:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:4030 GCLOUD_PROJECT=jci-oriente \
  pnpm --filter beacon seed:roles -- <uid> Admin
# Scanner needs event scope, set separately via the setUserRoles callable.
```

**Env-var guards (the only ones — no custom project logic):**

| Script | Guard | Why |
|--------|-------|-----|
| `seed:emulator` | `FIRESTORE_EMULATOR_HOST` (+ `FIREBASE_AUTH_EMULATOR_HOST` for the auth user) — both set by the `pnpm` script | The Admin SDK can only reach the emulator when these are set, so it can never touch prod. |
| `seed:roles` | `FIREBASE_AUTH_EMULATOR_HOST` | Same — necessary and sufficient. (`VITE_FIREBASE_EMULATOR_ENABLED` is a frontend build-time var, not visible to a Node script.) |

> Both scripts must use the **same `GCLOUD_PROJECT` as the app** (`jci-oriente`) — the
> emulator namespaces data/users per project, so a mismatch lands them where the app
> never looks. If your shell can't see the keg-only JDK, prefix emulator commands with
> the Java PATH (see Prerequisites above).

### Import/Export Emulator Data

`pnpm dev` (via `tools/scripts/emulators.sh`) already imports from and exports to
`emulator-data/` automatically, so state persists across restarts. To snapshot or restore
manually:

```bash
# Export current emulator state
firebase emulators:export ./emulator-data

# Start with existing data
firebase emulators:start --import=./emulator-data
```

## Deploying

**The normal path is the CD pipeline** — see `docs/ci-cd.md`. Merging to `main` with
green CI triggers the keyless (WIF/OIDC) Deploy workflow, which deploys only the
changed surfaces in order (rules → functions → hosting, with a preview → smoke →
promote flow for hosting), each job gated on a `production` environment approval.

The commands below are the **manual owner fallback** (first-run validation,
emergencies). They use human credentials (`firebase login`) and skip the smoke gate —
prefer the pipeline. For rollback, see `docs/ci-cd.md` section 9 (note: there is **no**
`firebase hosting:rollback` command).

### Manual Fallback Scripts (root `package.json`)

```bash
pnpm deploy:rules       # firestore (rules + indexes) + storage rules
pnpm deploy:indexes     # firestore composite indexes only
pnpm deploy:functions   # beacon (predeploy rebuilds apps/beacon/dist)
pnpm deploy:hosting     # builds spotlight + backstage (emulator flag off), deploys both targets
pnpm deploy:all         # rules → functions → hosting
```

### Deploy Specific Hosting Target

```bash
firebase deploy --only hosting:jcioriente
firebase deploy --only hosting:jcioriente-backstage
```

## Firestore Rules Deploy

```bash
pnpm deploy:rules   # firebase deploy --only firestore,storage
```

(The CD pipeline deploys rules automatically when `firestore.rules`, `storage.rules`,
`firestore.indexes.json`, or `firebase.json` change — `docs/ci-cd.md` section 3.)

> **Runbook — claim/rule changes need a token refresh.** Custom claims (`roles`, `perms`)
> are baked into each user's ID token and cached until it refreshes (~1h, or on re-login).
> After deploying perm-gated rules or backfilling claims (`seedRoles` + `recomputeAllClaims`),
> **already-signed-in users keep their old token** and may hit `permission-denied` ("No se
> pudieron cargar …") until they sign out and back in. Sequence to avoid a lockout window:
> backfill claims **first**, then deploy the rules; tell active users to re-login. (In dev,
> a `permission-denied` read logs a self-diagnosing hint to the console — see
> `apps/backstage/src/lib/query-client.ts`.)

## Firestore Rules Summary

Summary only — `firestore.rules` is the source of truth. Writes gate on the coarse
`perms` custom claim (`canDo(action, subject)`, e.g. `manage:all` for Admin — see the
seeding note above), plus per-collection invariants; some authorities stay role-based.

| Collection | Public read | Signed-in read | Client write | Notes |
|------------|-------------|----------------|--------------|-------|
| `board`, `siteConfig/current` | yes | yes | Admin role only | no delete |
| `showcase`, `allyShowcase` | yes | yes | **no** | beacon-written public projections |
| `projects`, `programs` | no | yes | perm-gated (+ direction on update) | initiative invariants (final-report lock, `featured` Admin/PM-only); no delete |
| `activities` | no | yes | perm-gated (+ parent direction on update) | no delete |
| `members` | no | `read:Member` perm or own doc | perm-gated + invariants | positions/claims trust gates; self `profilePicture`; EC positions-only; no delete |
| `allies` | no | `read:Ally` perm | perm-gated | no delete |
| `positions`, `roles` | no | yes | Admin-gated where grants/perms change | feed custom claims via beacon triggers; no delete |
| `events`, `pointRules` | no | yes | perm-gated | no delete |
| `terms` | no | yes | Admin role only | no delete |
| `checkIns` | no | yes | create/delete bound to the check-in window | Scanner limited to Attendee on own events; no update |
| `participations`, `memberPoints` | no | yes | **no** | engine ledger — beacon Admin SDK only |
| everything else | no | no | no | default deny |

Rules are tested by `@luminova/firestore-rules-tests` (Firestore) and
`@luminova/storage-rules-tests` (Storage). Each package script wraps
`firebase emulators:exec` itself (emulator lock + boot retry, project
`demo-rules-test`), so just run:

```bash
pnpm --filter @luminova/firestore-rules-tests test
pnpm --filter @luminova/storage-rules-tests test
```

A dev emulator already running on port 4010 conflicts with the test emulator — stop it
first (or run the tests with a transiently bumped `emulators.firestore.port`).

## Console Checklist (manual, one-time)

1. Authentication → Sign-in method → enable **Email/Password**. No other providers.
2. App Check:
   - Register a reCAPTCHA v3 site key for each web app (spotlight, backstage).
   - Paste each key into the matching app's `.env.local` as `VITE_APPCHECK_SITE_KEY`.
   - For local dev, copy the debug token printed in the browser console into
     `VITE_APPCHECK_DEBUG_TOKEN` and register it under App Check → Apps → Manage debug tokens.
   - Leave enforcement OFF until both apps send valid tokens in production.
3. Initial admin user — do **not** create it in the console (the console cannot set the
   `roles`/`perms` custom claims the rules gate on); run `pnpm seed:production` instead
   (see Production Bootstrap Script below).

## Firestore Indexes

Current `firestore.indexes.json` — add composite indexes as needed:

```json
{
  "indexes": [
    {
      "collectionGroup": "members",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "active", "order": "ASCENDING" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "participations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "memberId", "order": "ASCENDING" },
        { "fieldPath": "termId", "order": "ASCENDING" },
        { "fieldPath": "state", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

This file is the **single source of truth** for composite indexes: the CD pipeline
deploys indexes without `--force`, so an index that exists in prod but not in the file
fails the deploy loud instead of being silently deleted. If you ever create an index in
the console, mirror it here (see `docs/ci-cd.md` section 9). Manual deploy:
`pnpm deploy:indexes`.

## Storage Rules

`storage.rules` (deployed via `pnpm deploy:rules` or the CD pipeline) — summary; the
file is the source of truth:

| Path | Read | Write |
|------|------|-------|
| `members/{id}/profile.jpg` | signed-in | Admin/Membership or the member themself; JPEG ≤ 5 MB |
| `projects\|programs\|activities/{id}/photos/*` | signed-in | initiative/activity editors (direction or Admin/PM); JPEG ≤ 5 MB |
| `allies/{id}/logo` | **public** (backs a no-auth `<img>` on spotlight) | Admin/Membership; PNG/JPEG ≤ 2 MB |
| everything else | denied | denied |

Delete rules deliberately never touch `request.resource` (it is null on delete —
validating it would error, deny every delete, and orphan the blob). Tested by
`@luminova/storage-rules-tests` (see Firestore Rules Summary above).

## Production Bootstrap Script

`pnpm seed:production` bootstraps prod **once**: the president Auth user + member doc
(Admin via the Presidente cargo), the built-in role docs, and `siteConfig/current`.
It requires Application Default Credentials and refuses to run if any emulator env var
is set:

```bash
gcloud auth application-default login
# or GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
pnpm seed:production
```

Re-runs are a no-op for the president (a `meta/bootstrap` doc guards it); `siteConfig`
is re-written each run.

For wiping production data, see the runbook at `tools/scripts/wipe-prod.md`.

## Correo de invitación

When an admin provisions login access for a member, the app calls Firebase Auth's
`sendPasswordResetEmail` via `requestPasswordReset(email)` immediately after the
`provisionMemberLogin` callable returns. Firebase delivers the set-password link directly
to the member's inbox.

- **Auth emulator** — the emulator does not send real email; it prints the generated link
  to its log output (visible in the Emulator UI at http://localhost:4100 or in terminal).
- **Email failure fallback** — if `sendPasswordResetEmail` throws (e.g. network error,
  Auth quota), the drawer shows a warning and a "Copiar enlace de acceso" button so the
  admin can share the `actionLink` manually. The row-menu "Invitar acceso" path sets a
  toast instead.
- **Spanish template / sender name** — Firebase Console → Authentication → Templates →
  Password reset. Customizing the subject line, body, and "From" name is an owner op in
  the Firebase Console; no code change required. **Still pending** — until completed,
  members receive the default Firebase template in English.
- **Email-enumeration protection** — if Firebase Auth's email-enumeration protection is
  enabled, `sendPasswordResetEmail` resolves without revealing whether the address exists.
  The invite UI already treats a silent success as "sent" and offers the copy-link fallback.
  If invites stop arriving, check that setting and prefer the copy-link fallback.

## App Check (reCAPTCHA v3) & Password Reset

The Firebase client (`@luminova/firebase`) already initializes App Check with the
reCAPTCHA v3 provider when `VITE_APPCHECK_SITE_KEY` is set, and supports a
per-developer debug token. To turn it on and wire the branded reset flow:

1. **reCAPTCHA v3 key** — in the Firebase console, App Check → register the web app
   with a **reCAPTCHA v3** provider; copy the site key.
2. **Env** — set `VITE_APPCHECK_SITE_KEY` for prod builds. For local dev, register a
   debug token (App Check → Manage debug tokens) and set `VITE_APPCHECK_DEBUG_TOKEN`.
3. **Reset action URL** — Authentication → Templates → **Password reset** →
   "Customize action URL" → `https://<backstage-host>/reset`. Without this the reset
   email link lands on Firebase's default page instead of our branded `/reset` route
   (which reads `?mode=resetPassword&oobCode=…`).
4. **Localize** the password-reset email template to Spanish.
5. **Enforcement (roadmap G4)** — once keys are verified in prod, enable App Check
   **enforcement** for Authentication and Firestore. Do this only after confirming
   real traffic carries valid tokens, or you will lock out the app.
6. **Password policy** — the seeded admin account's password must satisfy the policy
   (min 6 + lower + upper + digit) or it can no longer sign in.
