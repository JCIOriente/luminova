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
# Install Firebase CLI globally
npm install -g firebase-tools

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
- **Auth** — a ready-to-login Admin user, linked to member m1:

  | Email | Password | Roles |
  |-------|----------|-------|
  | `admin@jci.test` | `Secret1` | Admin |

Log in to backstage with those credentials and you'll see every (Admin-gated) feature.
Re-running is idempotent.

**Granting roles to other users** (e.g. a Scanner or a second account you created in the
Emulator UI at http://localhost:4100):

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

### Deploy Everything

```bash
pnpm build
firebase deploy
```

### Deploy Hosting Only

```bash
pnpm --filter spotlight build
pnpm --filter backstage build
firebase deploy --only hosting
```

### Deploy Functions Only

```bash
pnpm --filter beacon build
firebase deploy --only functions
```

### Deploy Specific Hosting Target

```bash
firebase deploy --only hosting:jcioriente
firebase deploy --only hosting:jcioriente-backstage
```

## Firestore Rules Deploy

```bash
firebase deploy --only firestore:rules
```

## Firestore Rules Summary

| Collection | Public read | Authenticated read | Authenticated write | Notes |
|------------|-------------|-------------------|---------------------|-------|
| `projects` | yes | yes | yes | — |
| `board` | yes | yes | yes | — |
| `members` | no | yes | yes | — |
| `events` | no | yes | yes | — |
| `pointRules` | no | yes | yes | — |
| `allies` | no | yes | yes | — |
| `memberPoints` | no | yes | **no** | Writes only via beacon Admin SDK Cloud Function |
| everything else | no | no | no | Denied |

Rules are tested by `@luminova/firestore-rules-tests`. Run:

```bash
firebase emulators:exec --only firestore "pnpm --filter @luminova/firestore-rules-tests test"
```

## Console Checklist (manual, one-time)

1. Authentication → Sign-in method → enable **Email/Password**. No other providers.
2. App Check:
   - Register a reCAPTCHA v3 site key for each web app (spotlight, backstage).
   - Paste each key into the matching app's `.env.local` as `VITE_APPCHECK_SITE_KEY`.
   - For local dev, copy the debug token printed in the browser console into
     `VITE_APPCHECK_DEBUG_TOKEN` and register it under App Check → Apps → Manage debug tokens.
   - Leave enforcement OFF until both apps send valid tokens in production.
3. Authentication → Users → create the initial admin user (email/password).

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
    }
  ],
  "fieldOverrides": []
}
```

## Storage Rules

Default Storage rules should restrict to authenticated users:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /members/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Backfill Script

For migrating existing Firestore data when schema changes:

```bash
# Preview changes (dry run)
node tools/scripts/backfill-firestore.mjs --dry-run

# Apply changes
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json \
  node tools/scripts/backfill-firestore.mjs
```

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
  the Firebase Console; no code change required.

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
