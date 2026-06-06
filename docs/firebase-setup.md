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

```bash
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

There are **two** seed scripts — one for Firestore data, one for auth roles. They
must target the **same project** the app + emulator use (default `jci-oriente`, from
`.firebaserc` and `VITE_FIREBASE_PROJECT_ID`).

**Recommended local flow (from a clean `firebase emulators:start`):**

```bash
# 1. Firestore data — sample members + a Recognition Engine slice (term, activities,
#    participations, memberPoints) so Members, the member profile, and the Leaderboard
#    render real data. (point rules are NOT seeded — initialize them from the UI.)
pnpm seed:emulator

# 2. Create an auth user — via the Emulator UI (http://localhost:4100 → Authentication
#    → Add user), or REST. Copy its UID.

# 3. Grant that user roles so the role-gated nav (e.g. "Reglas de puntos" = Admin) shows.
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:4030 GCLOUD_PROJECT=jci-oriente \
  pnpm --filter beacon seed:roles -- <uid> Admin

# 4. Log in to backstage with that user and reload so the new claims load.
```

**Env vars (why they matter):**

| Script | Required env | Default project | Notes |
|--------|--------------|-----------------|-------|
| `seed:emulator` | `FIRESTORE_EMULATOR_HOST` (set by the script as `127.0.0.1:4010`) | `GCLOUD_PROJECT` or `jci-oriente` | Refuses to run unless the emulator host is set, so it can never touch prod. Admin SDK bypasses rules. |
| `seed:roles` | `FIREBASE_AUTH_EMULATOR_HOST` (point at `127.0.0.1:4030`); `GCLOUD_PROJECT` | `demo-roles` if unset | With the auth-emulator host set, the Admin SDK can only reach the emulator (never prod). **Set `GCLOUD_PROJECT` to your app's project** (`jci-oriente`) so the claims land on the user the app sees. |

> The Firestore emulator namespaces data per project, so `seed:emulator` and
> `seed:roles` must use the **same** `GCLOUD_PROJECT` as the app, or the data/claims
> land in a namespace your app never reads. If your shell can't see the keg-only JDK,
> prefix emulator commands with the Java PATH (see Prerequisites above).

### Import/Export Emulator Data

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
