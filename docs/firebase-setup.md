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
# Web Push (FCM) public VAPID key — project-level, same value for both apps.
# See "Push Notifications (FCM Web Push)" below. Public; ships in the client bundle.
VITE_FIREBASE_VAPID_KEY=<Web Push certificate public key>
# App Check (reCAPTCHA v3) — paste the real site key once created; blank (as here for local dev) disables App Check
VITE_APPCHECK_SITE_KEY=
VITE_FIREBASE_EMULATOR_ENABLED=false
```

For local development with emulators, set `VITE_FIREBASE_EMULATOR_ENABLED=true`.

### Beacon (apps/beacon)

Cloud Functions use Application Default Credentials — no env file needed.
For local emulator, the Firebase CLI handles credentials automatically.

## App Check

App Check uses **reCAPTCHA v3** to protect the Firebase backend from abuse.

- Setting `VITE_APPCHECK_SITE_KEY` enables App Check for that app; leaving it blank disables it. Prod builds carry the real site keys (`.env.production`); local `.env.local` leaves the key blank, so App Check is off in local dev and you develop against the emulators without a token.
- Enforcement is **ON** in production for Firestore and Storage. Every deployed client must send a valid token — that is why the lite read path (`getFirestoreLite`) also initializes App Check, not just the full SDK.

The `@luminova/firebase` package initializes App Check automatically when `VITE_APPCHECK_SITE_KEY` is set (shared `initAppCheck` helper, used by both `getFirebase` and `getFirestoreLite`).

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
   - Paste each key into the matching app's `.env.production` as `VITE_APPCHECK_SITE_KEY`.
   - Leave `.env.local` blank to develop with App Check off against the emulators.
   - Enable enforcement (Firestore + Storage) only after confirming deployed clients send valid tokens.
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

## Soft-Delete Shape Audit (pre-deploy gate)

`pnpm audit:soft-delete-shapes` scans `members`, `positions` and `allies` for docs
whose soft-delete pair is malformed — the shapes the well-formedness rules make
admin-SDK-only to edit (owner-op 4 of `docs/specs/position-assignment-lane.md`,
BLOCKING before those rules deploy). It exits non-zero when anything is found, so
it can gate a deploy. Read-only by default; `--repair` fixes only the unambiguous
shapes (a missing `deletedAt` becomes `null`; a missing `active` on a never-deleted
doc becomes `true`) and refuses to guess at the rest:

| Shape | `--repair` |
|---|---|
| `deletedAt` missing | → `null` |
| `active` missing, `deletedAt` null/missing | → `true` |
| `active` present but not a bool (the string `"false"`, or `null`) | refused — a human decides |
| `active` missing, `deletedAt` set | refused — the two fields disagree |
| `active: true` **with** a non-null `deletedAt` (the **ghost**) | refused — same disagreement. This is the one malformed shape that is client-reachable and that `memberDocSchema` accepts, so backstage lists the doc as an ordinary live member while every `deletedAt`-aware reader treats it as gone |
| `deletedAt` present, non-null, not a Timestamp (an ISO string, a number) | refused — the zod schemas reject it and the rules pin it immutable, so the doc is invisible and unwritable at once |

Repair is all-or-nothing per doc: when one field is ambiguous the unambiguous fix
is withheld too, so whoever resolves it sees the shape the audit reported.

Exit codes are distinct on purpose: **1** = the run completed and found malformed
docs (the gate); **2** = the run did *not* complete (a per-doc read/write failed,
or a production `--repair` was not confirmed). A crash must not read as a clean
gate failure.

For a malformed **member** it also reports whether a `boardShowcase` row is
currently published — but `--repair` is **not** a takedown, and removes no public
row:

- A **repaired** doc declares the member live (`active: true` / `deletedAt: null`),
  so the re-fired `onBoardMemberWritten` re-publishes it. The row correctly stays up.
- A **refused** doc (the non-bool `active`, the shape that was fail-open published)
  is not written at all, so no trigger fires and the row **stays published**. Two
  hand remedies, both printed per doc: a Firebase console edit of `active`, or an
  Admin `publicProfile: false` write — the members takedown arm in `firestore.rules`
  deliberately skips `softDeleteSafe()` and stays open on exactly these docs (pinned
  by a rules test). Backstage will not list such a member (`memberDocSchema` drops
  it), so make that write from the console or directly.

`--repair` **can add one**, though, and that direction is opt-in. Writing
`active: true` un-blocks the fail-closed `projectBoard` gate, so a member who also
carries `publicProfile: true` (the stamped org-wide default), a `uid`, a pinned
portrait and a current-term CEL/JDL cargo is **newly published** by the re-fired
trigger — publication as a side effect of a shape fix. Each such member gets a
`WILL PUBLISH:` line and their repair is **withheld** (counted separately from the
ambiguous refusals) unless `--allow-publish` is passed. The alternative to passing
it is to set `publicProfile: false` on the member first — the opt-out they never
exercised — and re-run. The forecast fails safe: a gate it cannot settle (an
unreadable `positions` or `boardShowcase` doc) is named in the output and the
member is announced anyway, never quietly repaired.

Ids that need a hand fix, and every PUBLISHED / WILL PUBLISH / UNKNOWN-publication
line, are never truncated; only the benign repairable listing is capped.

```bash
gcloud auth application-default login
pnpm audit:soft-delete-shapes                     # count + gate
pnpm audit:soft-delete-shapes --repair            # fix the unambiguous, report the rest
pnpm audit:soft-delete-shapes --repair --allow-publish  # …incl. the repairs that publish
```

Same credential model as `seed:production`; point it at the emulator by setting
`FIRESTORE_EMULATOR_HOST` first. A **production** `--repair` writes to members and,
through the trigger, re-projects the world-readable Directiva, so it demands an
explicit confirmation — type `repair-production-shapes` at the prompt, or pass
`--confirm=repair-production-shapes` in a non-interactive shell. Adding
`--allow-publish` widens what the run may do, so it widens the token: the string
becomes `repair-production-shapes-and-publish`, and the plain one is then rejected.
The typed string names the consequence, rather than the one flag that can ADD public
exposure being the one the prompt is silent about. The emulator needs no confirmation.

## Enlaces de acceso (no hay correo)

**The app sends no email at all in the auth flow.** Firebase's transactional email cannot be
meaningfully restyled, its sender is `noreply@<project>.firebaseapp.com`, and its links route
through `firebaseapp.com` before redirecting — it reads as phishing and lands in spam. JCI
Oriente coordinates over WhatsApp, so an operator generates a link and shares it by hand.

`issueMemberInvite({ memberId })` creates the Auth account if needed, links the uid, and mints
a single-use token. Backstage assembles `https://<backstage-host>/invitacion#<token>` and shows
it in a copy dialog with its expiry.

- **A link IS a credential.** Whoever holds it sets that member's password. Send it in a direct
  chat, never a group. There is no way to un-send one — the remedy is to re-issue, which
  revokes the previous link.
- **Links last 48 hours**, enforced in code (not by the TTL policy). The badge shows the date
  **and the time**, on the Bolivian clock — at this window a bare date is not precise enough to
  act on, since a link shared at 23:00 Monday dies at 23:00 Wednesday.
- **Both callables are rate-limited**: per link, 5 calls/min to *each* callable (so 5 to open
  the page plus 5 to submit), and 60/min endpoint-wide, held in the function instance's memory
  (nothing is written to Firestore). An invitee who reloads the page
  repeatedly can see *"Demasiados intentos. Espera unos segundos"* — this is **not** a broken
  link and needs no operator action. The budget refills one slot every 12 s. The ceiling is per
  function instance, so the effective figure is higher than 60 when several are warm.
- **Re-issuing kills the previous link.** The copy dialog says so. If a member reports "el
  enlace no sirve", check whether someone re-issued.
- **Auth emulator** — nothing is mailed, so there is nothing to read from the emulator log; the
  link is returned to the caller and rendered in the UI.
- **Do NOT disable the Email/Password provider** — sign-in depends on it, even though no
  Firebase email is sent.

### Owner ops for this flow

1. **REVERT the Password-reset action URL to the Firebase default.** Authentication →
   Templates → **Password reset** → "Customize action URL" → clear the custom value (back to
   `__/auth/action`). It previously pointed at `https://<backstage-host>/reset`, a route that
   no longer exists — so until this is reverted, the console's own "⋮ → Reset password" mails a
   link to a 404. **"Edit user → set password" always works and needs nothing.**
2. **Firestore TTL policy** on `memberInvites.purgeAt` — **NOT YET APPLIED.** Cleanup only;
   expiry is code-enforced against `expiresAt`, so nothing is broken without this. What it
   buys: the collection stops growing without bound as invites accumulate.

   ```bash
   gcloud firestore fields ttls update purgeAt \
     --collection-group=memberInvites --enable-ttl --project=jci-oriente
   ```

   **Verify it applied** — the command returns before the policy is live, so check the state
   rather than the exit code:

   ```bash
   gcloud firestore fields ttls list --project=jci-oriente
   ```

   Expect one row for `memberInvites.purgeAt` with `ttlConfig.state: ACTIVE`. `CREATING` means
   it is still building (minutes on a small collection) — re-run the list. **An empty result
   means the policy does not exist**, which is the state as of this writing: the list returned
   zero items, so the command above has never successfully run.

   Deletion is best-effort with up to ~24 h of lag, which is why expiry is never left to it.

3. ***** BLOCKING PRE-DEPLOY: confirm App Check covers Cloud Functions. *****

   `describeInvite` and `redeemInvite` now enforce App Check in production
   (`enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true"` — off under the emulator, so
   local `/invitacion` still works; see below). **If the Cloud Functions product is not
   App-Check-enabled for this project, every redemption fails the moment this deploys** —
   silently, totally, on the only onboarding path that exists.

   **What it looks like when it breaks**, so you can recognize it: firebase-functions rejects
   the call with `unauthenticated`, which carries no tagged `reason`. The invite page therefore
   shows its generic *"No pudimos validar el enlace. Revisa tu conexión e inténtalo de nuevo"*
   with a retry button that will never succeed. It reads to the invitee — and to whoever they
   complain to — as a network problem, not a configuration one. Nothing in the operator UI
   flags it.

   Two earlier claims in the specs were WRONG and are corrected here: the production
   reCAPTCHA site key *does* exist (`apps/backstage/.env.production` carries a real
   `VITE_APPCHECK_SITE_KEY`), and "/invitacion has no session" was never the blocker —
   attestation is app-level, `/invitacion` is deliberately a top-level route outside the
   `_auth` layout, and the client wires `initAppCheck` on first app acquisition.

   Before deploying:

   1. Firebase Console → **App Check** → confirm the backstage web app is registered with the
      reCAPTCHA v3 provider, and that **Cloud Functions** appears among its products with
      enforcement on (enforcement is per-product; Firestore and Storage being on says nothing
      about Functions).
   2. Deploy the functions to a **preview or staging** target if one is available, or accept
      that the first production deploy is the test, and immediately
   3. **Open `/invitacion#<a real freshly-issued token>` against a real production build** and
      complete a redemption end to end. Not a local build: the emulator path has no site key,
      so it cannot exercise attestation at all.

   **One more thing only this smoke test can catch.** Enforcement is keyed on
   `FUNCTIONS_EMULATOR`, and `firebase-tools` spreads whatever it reads from `apps/beacon/.env`
   / `.env.<projectId>` into **both** the deploy-time discovery run and the deployed function's
   environment. So a stray `FUNCTIONS_EMULATOR=true` line in a beacon dotenv would silently
   disable App Check **in production** — and nothing else would notice: the unit tests pin both
   branches, but they pin them at test time, never the deployed value. No such file exists today
   (`apps/beacon/` has no `.env*`, and `.env`/`.env.local` are gitignored). If one is ever added,
   this end-to-end check is the only thing standing between that line and an unprotected
   endpoint. A `gcloud run services describe` of the two services will show the resolved env.

   If it does fail: hard-code `ENFORCE_APP_CHECK = false` in
   `apps/beacon/src/redeem-invite.ts`, redeploy the two functions, and fix the registration
   before trying again. The rate limiter is independent and keeps working either way.

   **Local development is unaffected.** Enforcement is keyed on `FUNCTIONS_EMULATOR`, which the
   functions emulator sets and the deploy-time discovery run does not — so `/invitacion` works
   against the emulator with no site key, while a real deploy still enforces. Do not "fix" this
   by setting `VITE_APPCHECK_SITE_KEY` in `.env.local`: a production reCAPTCHA key cannot attest
   `localhost`, so that would break local dev rather than repair it.

4. **Cost and abuse signal on the two callables.**

   **Correction to what this document used to promise.** It said "a GCP budget alert on the
   two callables". A **billing budget cannot be scoped to a function** — budgets attach to a
   billing account and filter by project, label, or service (`--filter-projects`,
   `--filter-services`), never per function. So the per-callable signal has to be a
   **Cloud Monitoring alert policy** on the Cloud Run request count (gen2 functions run on
   Cloud Run, one service per function), and the billing budget is the coarse backstop.

   **a) Notification channel first.** An alert policy with no channel fires into nothing, and
   this SDK has no `gcloud monitoring channels` command group — so create it in the console:
   Cloud Console → **Monitoring → Alerting → Edit notification channels → Email → Add new**.
   Copy the channel id (`projects/jci-oriente/notificationChannels/NNNN`).

   **b) The alert policy.** Fires when either callable is invoked far above the chapter's real
   rate. JCI Oriente issues a handful of invites a week, so sustained double-digit
   requests-per-second is by definition not members onboarding:

   ```bash
   gcloud monitoring policies create \
     --project=jci-oriente \
     --display-name="Invite callables: abnormal request rate" \
     --condition-display-name="describeInvite/redeemInvite > 10 req/s for 5 min" \
     --condition-filter='metric.type="run.googleapis.com/request_count"
       resource.type="cloud_run_revision"
       resource.label."service_name"=monitoring.regex.full_match("describeinvite|redeeminvite")' \
     --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_RATE","crossSeriesReducer":"REDUCE_SUM","groupByFields":["resource.label.service_name"]}' \
     --if=10 \
     --duration=300s \
     --trigger-count=1 \
     --combiner=OR \
     --notification-channels=projects/jci-oriente/notificationChannels/NNNN
   ```

   Service names are lower-cased by Cloud Run, hence the lower-case regex. Substitute the real
   channel id for `NNNN`.

   **Verify it applied:**

   ```bash
   gcloud monitoring policies list --project=jci-oriente \
     --format="table(displayName,enabled,conditions[0].displayName)"
   ```

   Expect the policy listed with `enabled: True`. To verify it can actually *fire*, open
   Monitoring → Alerting → the policy → **Metrics Explorer** on its condition and confirm the
   time series resolves to the two services (an empty series means the filter matches nothing,
   and a policy that matches nothing is indistinguishable from a quiet week).

   **c) Billing budget** — the backstop, project-scoped, on the open billing account:

   ```bash
   gcloud billing budgets create \
     --billing-account=016148-904C31-A656A9 \
     --display-name="jci-oriente monthly" \
     --budget-amount=25USD \
     --filter-projects=projects/jci-oriente \
     --threshold-rule=percent=0.5 \
     --threshold-rule=percent=0.9 \
     --threshold-rule=percent=1.0
   ```

   **Verify:**

   ```bash
   gcloud billing budgets list --billing-account=016148-904C31-A656A9 \
     --format="table(displayName,amount.specifiedAmount.units,budgetFilter.projects)"
   ```

   A budget **notifies, it does not cap** — nothing stops spend. It is the "something is
   wrong" signal of last resort; the alert policy in (b) is the one that arrives in time to
   act, and `maxInstances: 10` plus the in-process rate limiter are what actually bound the
   damage.

   Adjust `--budget-amount` to whatever the chapter's normal monthly spend plus headroom is —
   25 USD is a placeholder, not a measured figure.

## App Check (reCAPTCHA v3)

The Firebase client (`@luminova/firebase`) already initializes App Check with the
reCAPTCHA v3 provider when `VITE_APPCHECK_SITE_KEY` is set. To turn it on and wire
the branded reset flow:

1. **reCAPTCHA v3 key** — in the Firebase console, App Check → register the web app
   with a **reCAPTCHA v3** provider; copy the site key.
2. **Env** — set `VITE_APPCHECK_SITE_KEY` in `.env.production` for prod builds. Leave
   `.env.local` blank so local dev runs against the emulators with App Check off.
3. **Reset action URL** — leave it at the Firebase DEFAULT. The `/reset` route it used to
   point at is deleted; see owner op 1 above.
4. **`describeInvite` / `redeemInvite` are the FIRST functions with it turned on.** They now
   declare `enforceAppCheck: true`. The blocker was never the site key (production has one) —
   it is that enforcement is per-product and **Cloud Functions is still not confirmed enabled**
   below. That makes confirming it a BLOCKING pre-deploy step, not a follow-up: see owner op 3
   under "Enlaces de acceso". A misconfigured deploy breaks member onboarding entirely,
   silently, for everyone.
5. **Enforcement** — **enabled** for Firestore and Storage. **Cloud Functions: UNCONFIRMED**,
   and the two invite callables now depend on it. Both frontends send a valid token (backstage
   via the full SDK, spotlight via `getFirestoreLite`). Only enable enforcement for a product
   after confirming real traffic carries valid tokens, or you will lock out the app.
6. **App Check is not a rate limiter, and the invite callables carry both.** A standard App
   Check token lives ~30 minutes and is replayable, so harvesting one from the public
   `/invitacion` page and flooding with it is not prevented by enforcement. `enforceAppCheck`
   bounds *who* may call; the in-process limiter in `apps/beacon/src/rate-limit.ts` bounds
   *how often*. Neither substitutes for the other.
7. **Password policy** — the seeded admin account's password must satisfy the policy
   (min 6 + lower + upper + digit) or it can no longer sign in.

## Push Notifications (FCM Web Push)

The notifications feature (spec `docs/specs/2026-07-21-notifications-design.md`) uses
Firebase Cloud Messaging web push. Two one-time Console owner ops enable it; the code
is otherwise complete.

### 1. Enable the Cloud Messaging API (V1)

`firebase-admin`'s `sendEachForMulticast` (the beacon `onNotificationCreated` trigger)
calls this API to send. Modern Firebase projects usually enable it automatically.

```bash
gcloud services enable fcm.googleapis.com --project jci-oriente
```

Or: Google Cloud Console → **APIs & Services → Library** → "Firebase Cloud Messaging
API" → **Enable**. (The deprecated "Cloud Messaging API (Legacy)" is **not** needed.)

### 2. Generate the Web Push (VAPID) key pair

Firebase Console → **⚙️ Project settings → Cloud Messaging → Web configuration →
Web Push certificates → Generate key pair**. Copy the **public** key (the private half
stays in Firebase). If a pair already exists, reuse it — regenerating invalidates every
issued token.

The Web Push certificate is **project-level**, so the same public key is used by both
web apps (backstage + spotlight).

### 3. Wire the key

Set the same value in **both** apps' `.env.local` (gitignored):

```bash
# apps/backstage/.env.local  AND  apps/spotlight/.env.local
VITE_FIREBASE_VAPID_KEY=<public key from step 2>
```

Vite inlines `import.meta.env` at build time — restart the dev server / redeploy after
changing it.

### 4. Grant the compose permission to existing members

`create:Notification` / `read:Notification` are seeded to **ExecutiveCommittee** (and
Admin via `manage:all`). Existing deployments need the perms pushed into live claims:
re-seed the ExecutiveCommittee role doc's `permissions` (or run the `recomputeAllClaims`
callable) so those members can compose. New/re-seeded environments get it automatically.

### 5. Verify

- **Emulators can't deliver push** (there is no FCM emulator — `getToken` still hits real
  FCM, but delivery needs a deployed/real environment). Test against a deployed build or
  with `VITE_FIREBASE_EMULATOR_ENABLED=false` + real Firestore.
- **Backstage:** load the app (installed PWA or a supported browser), accept "Activa
  notificaciones", grant OS permission → a token doc appears at
  `members/{uid}/fcmTokens/{token}`. Compose at `/notificaciones` → the device gets a push
  + an inbox entry (bell).
- **Spotlight:** on iOS, web push requires an **installed** PWA (Add to Home Screen, iOS
  16.4+); Android/desktop work in-browser. Accept the prompt → a `pushTokens/{token}` doc
  appears; an "Everyone" broadcast reaches it.

### Service worker note

Each app serves a standalone `public/firebase-messaging-sw.js` (background handler) that
is registered at the dedicated scope `/firebase-cloud-messaging-push-scope` so it coexists
with the vite-plugin-pwa workbox precache SW at `/` (two registrations cannot share a
scope). Firebase config is passed to it via the registration query string (a static SW
can't read `import.meta.env`); the values are the public web config, no secrets.
