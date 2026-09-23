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
  the page plus 5 to submit), and 600/min endpoint-wide, held in the function instance's memory
  (nothing is written to Firestore). An invitee who reloads the page
  repeatedly can see *"Demasiados intentos. Espera unos segundos"* — this is **not** a broken
  link and needs no operator action. That **per-link** budget refills one slot every 12 s.
- **The endpoint-wide ceiling is where an outage would come from, and it is ~10 req/s.** It is
  held per function instance, but do not read that as headroom that multiplies by
  `maxInstances`: a refusal is in flight for microseconds, so a flood barely moves the
  concurrency signal Cloud Run scales on and the pool stays near **one** instance well past
  the point where onboarding is already down. (CPU is a separate scaling signal a large enough
  flood does trip — so one instance is a conservative floor, not a guarantee.) Treat 600/min —
  about **10 requests/second sustained** — as the point where onboarding stops working *for
  everyone*, not just for the caller. That is the number the request-rate alert below is set
  against. (Canonical: `INVITE_GLOBAL_DENIAL_PER_SECOND` in `packages/types/src/member-invite.ts`,
  derived from the ceiling and pinned by a tripwire test that lists every site quoting it.)
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
   the call with `unauthenticated`, which carries no tagged `reason`. The invite page shows
   *"No pudimos completar la verificación de seguridad. Inténtalo de nuevo en un momento…"*
   under the heading *"No pudimos abrir el enlace"*, with a Reintentar button that unlocks
   after 15 s. That copy is deliberately the SAME for a misconfigured deploy and for a browser
   blocking reCAPTCHA, because the invitee cannot tell those apart and both remedies are
   listed. So the page will NOT tell you which one you are looking at — the console check in
   step 1 below is what distinguishes them.

   **There IS a server-side trace, and it is the fastest way to confirm this diagnosis.** An
   unregistered-product 403 does not leave the invitee's browser sending nothing: the token
   exchange fails, `@firebase/app-check` returns a **dummy** token rather than throwing, and
   that dummy travels in the `X-Firebase-AppCheck` header. firebase-functions therefore takes
   its `app === "INVALID"` arm and writes one line to Cloud Logging per failed redemption:

   ```
   Callable request verification failed: AppCheck token was rejected.
   ```

   Filter for it on the structured label the SDK attaches, OR on the message text. Both are in
   the query on purpose: the label is narrower, but it only matches if the logging agent
   promotes that payload key to `LogEntry.labels`, and a filter that silently matches nothing
   would hand you the opposite diagnosis under the paragraph below.

   ```bash
   gcloud logging read \
     'severity>=WARNING AND (labels."firebase-log-type"="callable-request-verification"
        OR "AppCheck token was rejected")' \
     --project=jci-oriente --freshness=1h --limit=20
   ```

   If the label half ever turns out to be the only one matching, drop the text half — not the
   other way round.

   Rows here mean attestation is reaching the server and being refused — this failure mode, or
   a blocked browser. **Zero rows while invitees report the error means the opposite**: the
   header never arrived at all, which takes firebase-functions' `MISSING` path and logs at
   DEBUG ("verification passed") before the `enforceAppCheck` throw — so absence of warnings
   is evidence too, not an all-clear. The `console.error` on the invitee's own browser
   ("invite: App Check rejected the call") remains the only trace for that second case, and it
   only helps if someone is looking over their shoulder.

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
   `FUNCTIONS_EMULATOR`, and `firebase-tools` spreads whatever it reads from a dotenv file into
   **both** the deploy-time discovery run and the deployed function's environment. So a stray
   `FUNCTIONS_EMULATOR=true` line would silently disable App Check **in production** — and
   nothing else would notice: the unit tests pin both branches, but they pin them at test time,
   never the deployed value.

   **Look in the right directory.** firebase-tools resolves the dotenv directory from the
   functions SOURCE, not the repo path — `lib/functions/env.js` uses
   `opts.configDir || opts.functionsSource`, and `firebase.json` declares
   `"source": "apps/beacon/dist"`. The files that reach the deployed runtime are therefore
   **`apps/beacon/dist/.env*`**, NOT `apps/beacon/.env*`, which firebase-tools never reads for
   this project. Grepping `apps/beacon/` clean does not clear this vector — an earlier version
   of this paragraph said it did, and the CI guard in `.github/workflows/ci.yml` states the
   correct path. That guard runs in PR CI **after** the build, which is the only place both of
   its arms are live: `dist` exists by then, including after a turbo cache restore. It used to
   sit in `deploy.yml` ahead of `predeploy`, where the arm that mattered never executed. Note also that the parser accepts the shell `export FOO=bar` spelling
   (`LINE_RE` is `^\s*(?:export)?\s*([\w./]+)\s*=`), so grep for both forms.

   `dist/` is gitignored and wiped by `apps/beacon/build.mjs` before every build, which
   `predeploy` runs — so a committed override cannot reach the path that matters, and no such
   file exists today. What remains reachable is what a repo grep cannot see: a turbo cache hit
   restoring an unlisted file, a console edit, or a value set directly on the Cloud Run service.
   For those, three things stand between that line and an unprotected endpoint: this
   end-to-end check, the module-scope `console.info` of the resolved value, and — since the
   App Check work — an automatic assertion on every deploy. The log line is emitted from
   `apps/beacon/src/index.ts`, beacon's single bundled entrypoint, so every beacon container
   logs it once at cold start; the value is the build's, identical on every service, and any
   one of them answers "what did the deployed code resolve?"

   **The deploy now asserts this for you.** `.github/workflows/deploy.yml` runs
   `.github/scripts/assert-deployed-env-clean.sh describeinvite redeeminvite` straight after
   `firebase deploy --only functions`, and a hit fails the job — which also holds back
   `deploy-hosting`, since it gates on the functions stage. Be clear on what that is worth:
   it **detects, it does not prevent**. The functions are already live when it reads them; what
   it stops is the rest of the release. Run the same script by hand any time:

   ```bash
   GCP_PROJECT_ID=jci-oriente bash .github/scripts/assert-deployed-env-clean.sh \
     describeinvite redeeminvite issuememberinvite recomputeallclaims \
     reseedbuiltinroleperms seedroles setuserroles
   ```

   **Every deployed CALLABLE, not just the invite pair** — the debug pair forges Auth tokens on
   the authenticated ones too (above), so scoping the assertion to two services left the five
   with the most reach unchecked. The list is derived from `index.ts`'s own callable exports by a
   test, so a new callable that is not asserted here turns that test red.

   Verified against the real thing on 2026-09-22: run against the deployed `describeinvite`,
   the script reports `ok: describeinvite carries none of FUNCTIONS_EMULATOR FIREBASE_DEBUG_MODE
   FIREBASE_DEBUG_FEATURES` and exits 0; with one of those keys injected into the same captured
   output it exits 1 and names the `gcloud run services update … --remove-env-vars` remedy. The
   service's env at that point was FIREBASE_CONFIG, GCLOUD_PROJECT, EVENTARC_CLOUD_EVENT_SOURCE,
   FUNCTION_TARGET and LOG_EXECUTION_ID — that capture is the `CLEAN` fixture in the test file,
   so the fixtures are pinned to output the tool really produces.

   Use the script rather than an ad-hoc `gcloud` pipeline, so the manual check and the deploy
   gate cannot drift — and because the ad-hoc form this replaced had a false pass in it: it
   piped a flattened `--format='value(...)'` rendering into `grep`, and an empty string (a
   changed rendering, an env list that did not load) matches nothing and reads as "clean". The
   script parses the JSON and treats an empty env list as a failure to verify, not a pass. Its
   arms are covered by fixtures in `.github/scripts/assert-deployed-env-clean.test.mjs`
   (`pnpm test:ci-scripts`): a permission error or an unparseable response fail, and a missing
   service is tolerated with a warning — one absent service says nothing about the other. But
   if **no** service can be read the job fails, because then nothing was verified at all. That
   is also what catches a wrong region, which looks exactly like every service being absent.

   **It checks THREE variables, not one.** `FUNCTIONS_EMULATOR` is what our own code keys on,
   but `FIREBASE_DEBUG_MODE` (and `FIREBASE_DEBUG_FEATURES` carrying `skipTokenVerification`)
   fails the control open one level lower, inside firebase-functions: it routes App Check
   through `unsafeDecodeAppCheckToken`, which accepts a self-crafted UNSIGNED token.
   Enforcement would still read as `true` in the log line while accepting anything — so the
   cold-start log cannot catch that family. The repo-side grep in `ci.yml` still covers only
   `FUNCTIONS_EMULATOR`, because the debug pair cannot arrive from a repo file.

   **THE DEBUG PAIR IS NOT AN APP CHECK PROBLEM — IT FORGES AUTH TOKENS TOO.** This is the part
   worth understanding before reading the guard, because the first version of that guard got it
   wrong. `isDebugFeatureEnabled("skipTokenVerification")` is consulted **twice** in
   firebase-functions' `common/providers/https.js`: once in `checkAppCheckToken`, and once in
   `checkAuthToken`, where it swaps `getAuth().verifyIdToken()` for `unsafeDecodeIdToken` — a JWT
   shape test, a base64 decode of the payload, and `uid = sub`, with **no signature check**. It
   then sets `ctx.auth` and reports the token VALID. `apps/beacon/src/callable-auth.ts` is
   beacon's only authorization gate and reads its `roles` / `perms` claims straight off that
   payload, so while the bypass is live:

   ```
   Authorization: Bearer <base64 header>.<base64 {"sub":"x","roles":["Admin"]}>.<junk>
   ```

   satisfies `requireAdmin` on `setUserRoles`, `seedRoles`, `recomputeAllClaims`,
   `reseedBuiltInRolePerms` and `issueMemberInvite` — custom-claim assignment and a project-wide
   role reseed. It is **strictly worse** on those five than on the invite pair, because they pass
   no options to `onCall`, so `enforceAppCheck` defaults falsy and there is no attestation gate
   there to lose: the forged claim is the only gate.

   **Both halves are refused IN-PROCESS, which is prevention rather than detection.** Unlike
   `FUNCTIONS_EMULATOR`, the debug pair is readable by the running container itself, so
   `tokenVerificationBypassEnabled()` in `apps/beacon/src/token-verification-bypass.ts` evaluates
   the real condition and `assertTokenVerificationNotBypassed()` throws `internal` while it holds
   — no gcloud, no region assumption, no service list. It runs from the two choke points every
   callable already crosses: `loadValidInvite` for the unauthenticated invite pair, and
   `requireAdmin` / `requireAdminOrPerm` for every authenticated one. It is gated on the
   emulator, so local dev is unaffected.

   Note the deliberate difference in strictness: this script bans all three keys at **any
   value**, because from outside the process it cannot evaluate three consumers' truthiness rules
   and none of them belong on a deployed service; the in-process guard fires only on the
   condition firebase-functions actually acts on (`FIREBASE_DEBUG_MODE` exactly `"true"` **and** a
   parseable `FIREBASE_DEBUG_FEATURES` object with a truthy `skipTokenVerification`), because a
   false positive would take down the admin surface and the only onboarding path at once. A
   parity test (`token-verification-bypass.test.ts`) runs our predicate and the installed
   library's own gate against the same 13 environments, so a version bump that moves the
   condition fails a test instead of silently disarming the guard.

   `FUNCTIONS_EMULATOR` gets no in-process guard and cannot: keying on it is what turns the guard
   off, and separating a real emulator run from an injected value would need a positive
   production marker, which must never be added (it would fail open the day that variable is
   renamed). **For that one key this script remains the only control.**

   **Alert on the refusal.** While the bypass is live every guarded call is refused and no other
   log line is emitted, so this is the only evidence there is. It recurs at most once per choke
   point per 10 s per instance — bounded, but never permanently silent, so a log-based alert can
   be armed on it. The exact string (pinned by a test, so it cannot drift away from this page):

   ```
   REFUSING traffic: FIREBASE_DEBUG_MODE + skipTokenVerification make this instance accept UNSIGNED Auth and App Check tokens. Remove both from the service environment.
   ```

   `us-central1` is the gen2 default, which is what these get — beacon sets no `region` on any
   callable and calls no `setGlobalOptions`. The script defaults to it and takes `GCP_REGION`
   if a region is ever added; confirm with `gcloud run services list --project=jci-oriente`.


   If it does fail: hard-code `ENFORCE_APP_CHECK = false` in
   `apps/beacon/src/redeem-invite.ts`, redeploy the two functions, and fix the registration
   before trying again. The rate limiter is independent and keeps working either way.

   **You must flip the pinned assertion in the same commit, or CI blocks the rollback.**
   `apps/beacon/src/redeem-invite.test.ts` asserts
   `expect(UNAUTHENTICATED_CALL.enforceAppCheck).toBe(true)` — deliberately, so nobody disables
   enforcement by accident. During a real outage that guard is between you and restoring
   onboarding: `pnpm --filter beacon ci` goes red and the PR is blocked. Change both files
   together and say in the commit message that it is a deliberate temporary rollback, then
   revert both once the registration is fixed. Flip the assertion to `false` rather than
   deleting it — a deleted assertion is how enforcement silently never comes back.

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

   **b) The alert policy.** It must fire *below* the rate limiter's own ceiling, because that
   ceiling is where onboarding breaks: the endpoint-wide bucket is 600/min **per instance**,
   and a flood barely moves Cloud Run's concurrency signal — a refusal is in flight for
   microseconds — so the pool stays near one instance and ~10 req/s sustained denies every
   invitee. An alert above that point could only ever report an outage already in progress.

   Hence **`> 8` req/s over a single 60 s window** — just under the ceiling
   (`INVITE_GLOBAL_DENIAL_PER_SECOND`, canonical in `packages/types/src/member-invite.ts`; if
   that figure is ever retuned, this threshold moves with it and a tripwire test says so), and
   matched to the
   limiter's own 60 s window. There is no false-positive budget to protect: JCI Oriente issues
   a handful of invites a week, so the normal rate is indistinguishable from zero and an early,
   twitchy alert costs nothing. `--duration=60s`, not the 300 s (five minutes) an earlier draft
   used, for the same reason.

   **How much warning this buys, honestly.** The policy needs one full 60 s aligned point plus
   its duration, so ~2 minutes at best, before ingestion delay. The bucket's burst tolerance
   means a *marginal* flood takes much longer than that to bite — at 11 req/s the first refusal
   is roughly ten minutes out, so the alert genuinely precedes the outage. A serious flood does
   not wait: at 50 req/s refusals begin within ~15 s and the alert is a post-mortem. Treat it
   as a detector, not a guard. The guard is the ceiling itself.

   ```bash
   gcloud monitoring policies create \
     --project=jci-oriente \
     --display-name="Invite callables: abnormal request rate" \
     --condition-display-name="describeInvite/redeemInvite > 8 req/s for 1 min" \
     --condition-filter='metric.type="run.googleapis.com/request_count"
       resource.type="cloud_run_revision"
       resource.label."service_name"=monitoring.regex.full_match("describeinvite|redeeminvite")' \
     --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_RATE","crossSeriesReducer":"REDUCE_SUM","groupByFields":["resource.label.service_name"]}' \
     --if='> 8' \
     --duration=60s \
     --trigger-count=1 \
     --combiner=OR \
     --notification-channels=projects/jci-oriente/notificationChannels/NNNN
   ```

   `--if` takes a **comparison**, not a bare number — `gcloud monitoring policies create --help`
   gives it as one of `absent`, `< THRESHOLD`, `> THRESHOLD`. A bare `--if=50` (what an earlier
   draft of this document printed) is rejected as an argument error, so the policy never gets
   created. Quote it, or the shell eats the `>` as a redirect.

   Service names are lower-cased by Cloud Run, hence the lower-case regex. The bucket is
   per-callable — each gen2 function is its own Cloud Run service and `createRateGate()` runs
   once per callable — so keeping the two on separate series via `groupByFields` matches how
   the limiter counts. One mismatch remains, in the safe direction: `REDUCE_SUM` adds every
   series of a service, i.e. across *instances*, while the bucket is per instance. If the pool
   ever does scale out, the summed figure over-reports against any single bucket, so the alert
   fires early rather than not at all.

   **What this metric does and does not tell you.** `run.googleapis.com/request_count` counts
   served and throttled requests identically, so it is a *request-rate* alert, not a
   throttle-rate one. That is the right signal here — crossing the ceiling is exactly what
   total request rate measures — but it means the alert cannot confirm on its own that anyone
   was actually refused. For that, grep Logs Explorer for the sampled refusal lines the gate
   emits: `rate-limited-global` and `rate-limited-token`. Expect the **global** line during a
   flood, and treat the token line as best-effort — the two branches share ONE sampler slot per
   gate, so sustained global refusals win it every interval and a real invitee's token refusal
   can go unlogged for as long as the flood lasts. Do not build the alert on these lines either
   way: `shouldLogRefusal` caps them at one per gate per instance per 10 s, so they saturate at
   six a minute whether the flood is 11 req/s or 11,000 — presence, never rate.

   **A THIRD population exists since App Check enforcement, and it charges no bucket.** An
   App-Check-rejected call is thrown by firebase-functions inside `onCallHandler`, before our
   handler — and therefore before `admitGlobal` — ever runs. Cloud Run counts it;
   the limiter never sees it. So the three populations are distinguishable only by response
   code:

   | Population | `HttpsError` code | HTTP |
   |---|---|---|
   | App Check rejected / missing | `unauthenticated` | **401** |
   | Rate-limit refusal | `resource-exhausted` | **429** |
   | Tagged invite refusal (expired, used, …) | `failed-precondition` | **400** |

   Before concluding anything from this alert, break the condition's series down by
   `response_code` in Metrics Explorer. A 401 spike with NO `rate-limited-global` lines is not
   a false positive — it is either a header-less flood burning invocations against
   `maxInstances: 10`, or, in the days around this deploy, **the registration failure this
   section's owner-op exists to prevent**, in which case every legitimate redemption is 401ing
   too. That is the single best detector for it.

   Leave the `--if='> 8'` filter unscoped — excluding 401 would blind the alert to both of
   those.

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
