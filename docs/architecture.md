# Architecture

## System Overview

```mermaid
%% Luminova / JCI Oriente — container diagram
%% The split is the trust boundary: everything above the rules membrane runs in a
%% browser the chapter does not control. Everything below runs with the Admin SDK
%% and bypasses rules entirely.
%% Source of truth: docs/architecture.md

flowchart TB
    subgraph untrusted["Untrusted — runs in the visitor's browser"]
        direction LR
        spotlight["<b>spotlight</b><br/>Public site<br/><i>firebase/firestore/lite</i><br/>no Auth · no realtime"]
        backstage["<b>backstage</b><br/>Admin dashboard<br/><i>full Firebase client SDK</i><br/>Auth required"]
    end

    rules{{"<b>firestore.rules</b> + storage.rules<br/>the only enforcement boundary"}}

    subgraph data["Firebase project · jci-oriente"]
        direction LR
        firestore[("Firestore<br/>one database")]
        storage[("Storage<br/>one bucket")]
        fbauth["Firebase Auth<br/>custom claims: roles + perms"]
    end

    subgraph trusted["Trusted — Admin SDK, rules do not apply"]
        beacon["<b>beacon</b><br/>Cloud Functions · nodejs24<br/>triggers + callables"]
    end

    spotlight -->|"read only: siteConfig · showcase<br/>allyShowcase · boardShowcase"| rules
    spotlight -.->|"the one public write: <b>leads</b>"| rules
    backstage <-->|"authenticated CRUD"| rules

    rules <--> firestore
    rules <--> storage
    backstage <--> fbauth

    firestore -->|"document triggers"| beacon
    backstage -->|"callables"| beacon
    beacon -->|"writes projections,<br/>ledgers and claims"| firestore
    beacon --> fbauth

    classDef client fill:#e8f0fe,stroke:#4285f4,stroke-width:1px,color:#111
    classDef server fill:#e6f4ea,stroke:#34a853,stroke-width:1px,color:#111
    classDef store fill:#fef7e0,stroke:#f9ab00,stroke-width:1px,color:#111
    classDef boundary fill:#fce8e6,stroke:#ea4335,stroke-width:2px,color:#111
    class spotlight,backstage client
    class beacon server
    class firestore,storage,fbauth store
    class rules boundary
```

_Source: [`docs/diagrams/container.mmd`](diagrams/container.mmd) — edit there, then re-embed._

Both web apps (spotlight and backstage) are registered as separate Firebase web app entries
within the same project and share one Firestore database and one Storage bucket
(`jci-oriente.firebasestorage.app`). Each app has its own App Check configuration.

## Apps

### spotlight (Public Site)
- React SPA deployed to Firebase Hosting target `jcioriente`
- Ships **no full Firebase client** — public data (`siteConfig`, `showcase`,
  `allyShowcase`) is read through the lightweight `firebase/firestore/lite` subpath via
  `@luminova/firebase/lite` (no Auth, no realtime)
- Public routes do not require authentication
- Contact form writes a `leads` doc directly (the one public write the site performs) —
  `src/leads/submit-lead.ts` via the lite SDK, gated by `leadCreateValid()` in
  `firestore.rules`; triaged in backstage at `/leads`
- Firebase web app registration: `1:953870918238:web:63d0034740735d618b4acf`

### backstage (Admin Dashboard)
- React SPA with Firebase Auth + Firestore, deployed to Firebase Hosting target `jcioriente-backstage`
- Imports `@luminova/firebase` at boot (always included in the bundle)
- All routes except `/login`, `/forgot-password`, and `/reset` require authentication
- CRUD/admin surfaces: members, positions, initiatives (programs/projects), activities
  + QR check-in, point rules, allies, roles/permissions (`/permisos`), site config (`/config`)
- Member profile pictures and initiative/activity photos stored in Firebase Storage
- Firebase web app registration: `1:953870918238:web:acbd53d377846bd88b4acf`

### beacon (Cloud Functions)
- Node.js 24 Firebase Cloud Functions (runtime: `nodejs24`, functions codebase `beacon`)
- Firestore triggers: `awardPoints` (`checkIns/{id}` — the Recognition Engine),
  `onProgramWritten` / `onProjectWritten` (roster → participation reconciliation +
  `showcase` projection), `onActivityWritten` (photo roll-up into the showcase),
  `onMemberWritten` (custom-claims sync: roles + perms), `onRoleWritten` (role-definition
  claims re-sync), `onAllyWritten` (`allyShowcase` public projection),
  `onMemberCreated` (stamps the `publicProfile` opt-out default — clients may not set it),
  `onBoardMemberWritten` (`boardShowcase` public Directiva projection),
  `onNotificationCreated` (inbox fan-out + best-effort FCM)
- Callables: `setUserRoles`, `seedRoles`, `recomputeAllClaims`, `provisionMemberLogin`
- Uses Firebase Admin SDK (server-side only)

## Data Flow: Point Calculation

```mermaid
%% Luminova — the Recognition Engine: one check-in becomes a member's points
%% The flagship domain flow. Note step 5: the recompute is transactional, which is
%% the whole point — concurrent check-ins for the same member must not race.
%% Source of truth: docs/architecture.md "Data Flow: Point Calculation",
%% docs/data-models.md "Recognition Engine (F3)"

sequenceDiagram
    autonumber
    actor scanner as Admin / PM / Scanner<br/>(backstage)
    participant fs as Firestore
    participant beacon as beacon · awardPoints<br/>(Admin SDK)
    participant ui as Leaderboard<br/>+ member profile

    scanner->>fs: write checkIns/{id}
    Note over scanner,fs: the only thing a human writes —<br/>everything below is derived

    fs-->>beacon: onDocumentWritten checkIns/{id}

    beacon->>fs: read activities/{activityId}
    beacon->>fs: read pointRules/{termId__code}

    beacon->>fs: derive participations/{activityId__memberId__role}
    Note right of beacon: engine-written ledger,<br/>client read-only

    rect rgb(232, 244, 234)
        beacon->>fs: recompute memberPoints/{memberId__termId}
        Note right of beacon: TRANSACTIONAL — read + write in one<br/>transaction, so concurrent check-ins<br/>for the same member cannot race
    end

    beacon->>fs: mirror members.totalPoints
    Note right of beacon: write-skipped when unchanged,<br/>so no trigger feedback loop

    fs-->>ui: read memberPoints
```

_Source: [`docs/diagrams/checkin-points.mmd`](diagrams/checkin-points.mmd)_

## Shared Packages

### @luminova/firebase
Memoized `getFirebase()` client singleton with App Check + emulator wiring.
Initializes Firebase app, Auth, Firestore, and Storage on first call; subsequent calls return
the cached instance. Optionally initializes App Check (reCAPTCHA v3) when
`VITE_APPCHECK_SITE_KEY` is set. Connects all services to emulators when
`VITE_FIREBASE_EMULATOR_ENABLED=true`. Both frontend apps import from this package;
spotlight uses the `@luminova/firebase/lite` subpath (`firebase/firestore/lite`, no Auth)
to keep the public bundle small.

### @luminova/ui
Bespoke token-driven component library built on Tailwind CSS utilities.
shadcn/Radix UI components are added for complex widgets via `pnpm dlx shadcn@latest add`.
Both Spotlight and Backstage consume from here.

### @luminova/types
TypeScript interfaces + Zod schemas for all Firestore documents (built package, emits
`dist/`). Shared by the frontend apps **and** beacon: pure engine types + helpers live
under the `@luminova/types/engine` subpath (framework-free, admin-SDK safe).

### @luminova/utils
`cn()` utility (clsx + tailwind-merge). Shared across all apps.

## Monorepo Task Orchestration (Turborepo)

```
build / typecheck / ci
  └── depends on: ^build (packages build before apps)

dev / preview
  └── cache: false, persistent: true

lint / test
  └── no dependencies
```

Deploys are **not** turbo tasks: manual deploys run via the root `pnpm deploy:*` scripts
(`deploy:rules`, `deploy:indexes`, `deploy:functions`, `deploy:hosting`, `deploy:all`),
and the normal path to production is the keyless, approval-gated CD pipeline — see
`docs/ci-cd.md`.

## Local Development

1. Start everything: `pnpm dev` — boots the Firebase emulators, waits for them, seeds
   the emulator (`pnpm seed:emulator`), then starts all apps
2. Spotlight at `http://localhost:5173`
3. Backstage at `http://localhost:5174`
4. Emulator UI at `http://localhost:4100`

## Authorization

Two independent claim streams reach the CASL ability. Coarse `action:Subject`
permissions come from the `perms` claim, resolved from runtime-editable
`roles/{roleId}` documents plus per-member grant/revoke overrides (revoke wins) and
capped at `PERMISSION_CAP` (30) — over the cap the claim is **not minted at all**, so
authority fails closed. Object-scoped conditional grants come from the built-in
`roles` claim instead and are hardcoded in `applyConditional()`, deliberately not
editable in `/permisos`.

The client ability drives UX only. `firestore.rules` is the enforcement boundary, and
the two must agree — a direct SDK write never executes client code. See
[`engineering-guardrails.md`](engineering-guardrails.md) #2.

```mermaid
%% Luminova — the authorization chain
%% Two independent streams reach the CASL ability: coarse permissions from the
%% runtime-editable `perms` claim, and hardcoded object-scoped grants from the
%% built-in `roles` claim. Only the first is editable in /permisos.
%% The client ability is UX. firestore.rules is enforcement. They must agree.
%% Source of truth: packages/auth/src/{perms,ability}.ts,
%% packages/types/src/permission.ts, firestore.rules

flowchart TB
    subgraph authored["Authored at runtime — no deploy needed"]
        rolesdoc[("roles/{roleId}<br/>permissions: PermissionCode[]<br/><i>edited in /permisos</i>")]
        overrides["member overrides<br/>grant[] / revoke[]<br/><i>revoke wins</i>"]
    end

    resolve["<b>resolveEffectivePerms()</b><br/>union of role perms<br/>+ grants − revokes<br/>deduped + sorted"]

    cap{"length ≤ PERMISSION_CAP (30)?"}
    failclosed["<b>fail closed</b><br/>claim not minted"]

    subgraph token["Firebase ID token · custom claims"]
        permsclaim["<b>perms</b><br/>coarse action:Subject codes"]
        rolesclaim["<b>roles</b><br/>built-in role names"]
    end

    ability["<b>buildAbility()</b> · CASL<br/>@luminova/auth"]
    conditional["applyConditional()<br/>object-scoped grants<br/><i>hardcoded, NOT UI-editable</i><br/>e.g. Member → update own uid"]

    subgraph client["backstage UI — user experience only"]
        cangate["&lt;Can&gt; gates · useCan()<br/>nav, buttons, routes"]
    end

    server["<b>firestore.rules</b><br/>server-side enforcement"]

    rolesdoc --> resolve
    overrides --> resolve
    resolve --> cap
    cap -->|no| failclosed
    cap -->|yes| permsclaim

    rolesdoc -. "onRoleWritten" .-> resolve
    overrides -. "onMemberWritten" .-> resolve

    permsclaim --> ability
    rolesclaim --> conditional
    conditional --> ability
    ability --> cangate

    ability <-- "MUST AGREE" --> server

    note["A direct SDK write never executes client code.<br/>Hiding a button is not a permission.<br/>Every write-invariant needs a rules test.<br/>— engineering-guardrails.md #2"]
    server --- note

    classDef editable fill:#e8f0fe,stroke:#4285f4,color:#111
    classDef claim fill:#fef7e0,stroke:#f9ab00,color:#111
    classDef enforce fill:#fce8e6,stroke:#ea4335,stroke-width:2px,color:#111
    classDef ux fill:#f3e8fd,stroke:#a142f4,color:#111
    classDef warn fill:#fff,stroke:#ea4335,stroke-dasharray:3 3,color:#111
    class rolesdoc,overrides editable
    class permsclaim,rolesclaim claim
    class server,failclosed enforce
    class cangate,conditional ux
    class note warn
```

_Source: [`docs/diagrams/authz.mmd`](diagrams/authz.mmd)_

## Data Model

Collections fall into four write tiers, and the tier tells you who may write:

| Tier | Collections | Writer |
|------|-------------|--------|
| Source of truth | members · positions · terms · programs · projects · activities · pointRules · allies · roles · siteConfig · checkIns · leads | admins, rules-gated (`leads` is the one public write) |
| Engine-written | participations · memberPoints | beacon only; clients read-only |
| Public projections | showcase · allyShowcase · boardShowcase | beacon only; world-readable |
| Per-user | notifications · pushTokens | keyed by Firebase Auth UID, not memberId |

Field-level schemas live in [`data-models.md`](data-models.md); this diagram carries
only the relationships and the composite keys, which are the non-obvious part.

```mermaid
erDiagram
    terms ||--o{ programs : "scopes"
    terms ||--o{ projects : "scopes"
    terms ||--o{ activities : "scopes"
    terms ||--o{ pointRules : "prices (16 fixed codes)"
    terms ||--o{ memberPoints : "scopes"
    terms }o--o{ members : "board roster (BoardSeat)"

    members }o--|| positions : "holds cargo"
    members ||--o{ checkIns : "attends"
    members ||--o{ participations : "earns"
    members ||--|| memberPoints : "aggregates to"
    members }o--o{ roles : "roles claim"

    programs ||--o{ activities : "parentId (ProjectExecution)"
    projects ||--o{ activities : "parentId (ProjectExecution)"
    activities ||--o{ checkIns : "attendable unit"

    checkIns ||--|| participations : "engine derives"
    participations }o--|| memberPoints : "engine recomputes"
    pointRules ||--o{ participations : "values"

    programs ||--o| showcase : "beacon projects"
    projects ||--o| showcase : "beacon projects"
    activities ||--o{ showcase : "photo roll-up"
    allies ||--o| allyShowcase : "beacon projects"
    terms ||--o{ boardShowcase : "beacon projects Directiva"

    members ||--o{ notifications : "inbox (by auth UID)"
    members ||--o{ pushTokens : "FCM tokens (by auth UID)"

    terms {
        string id PK "the doc id IS the year, e.g. 2026"
        string status "Activo or Cerrado"
    }
    members {
        string id PK "source of truth"
        string membershipStatus "Activo, Inactivo, Desafiliado"
        number totalPoints "engine-mirrored, never hand-edited"
    }
    activities {
        string id PK "the unified attendable unit"
        string category "Assembly through ProjectExecution"
        string parentId "null means institutional"
        boolean hasCheckIns "beacon-only; locks the doc once true"
    }
    checkIns {
        string id PK "the only human-written engine input"
        string role "Director, CoDirector, Team, Attendee"
    }
    participations {
        string id PK "activityId__memberId__role"
        string tier "ENGINE-WRITTEN, client read-only"
    }
    memberPoints {
        string id PK "memberId__termId"
        string tier "ENGINE-WRITTEN, recomputed transactionally"
    }
    pointRules {
        string id PK "termId__code"
    }
    showcase {
        string tier "PUBLIC PROJECTION, world-read, beacon-written"
    }
    allyShowcase {
        string tier "PUBLIC PROJECTION, world-read, beacon-written"
    }
    boardShowcase {
        string tier "PUBLIC PROJECTION, world-read, beacon-written"
    }
    leads {
        string id PK "the one collection the public may write"
    }
    siteConfig {
        string id PK "current, world-readable CMS document"
    }
```

_Source: [`docs/diagrams/data-model.mmd`](diagrams/data-model.mmd)_

## Delivery Pipeline

Three hard gates, two of them on the contributor's own machine. Full detail in
[`ci-cd.md`](ci-cd.md).

```mermaid
%% Luminova — from a local edit to production
%% Three hard gates, two of them on the contributor's own machine. Nothing reaches
%% production unattended, and no long-lived deploy credential exists anywhere.
%% Source of truth: docs/ci-cd.md sections 1-4, CLAUDE.md Tooling Index

flowchart TB
    subgraph local["On the contributor's machine — git hooks"]
        edit["edit in a worktree<br/><i>.worktrees/slug</i>"]
        bguard{"<b>branch-guard.sh</b><br/>on main?"}
        precommit["<b>pre-commit.sh</b><br/>format · lint · typecheck<br/><i>auto-fixes, then re-stages</i>"]
        router["<b>review-router.sh</b><br/>computes the mandated<br/>review set from the diff"]
        rgate{"<b>review-gate.sh</b><br/>fresh review trailer<br/>covering this diff?"}
        blocked["<b>blocked</b> — exit 2"]
    end

    subgraph ci["CI · ci.yml — every PR"]
        checks["checks<br/>build · lint · typecheck · test<br/>bundle-budget · audit"]
        emu["emulator suites<br/>Firestore + Storage rules<br/>beacon race guards"]
    end

    merge(["merge to main"])

    subgraph cd["CD · deploy.yml — on CI success on main"]
        filter["<b>filter</b><br/>which surfaces changed?"]
        approve{{"<b>reviewer approval</b><br/>GitHub production environment<br/><i>one click, always required</i>"}}
        drules["deploy-rules<br/>firestore + storage + indexes"]
        dfunc["deploy-functions<br/>beacon gen2"]
        dhost["deploy-hosting"]
        preview["preview channel<br/><i>ci-sha, expires in 1 day</i>"]
        smoke["smoke test"]
        promote["promote to live"]
    end

    edit --> bguard
    bguard -->|yes| blocked
    bguard -->|no| precommit
    precommit --> router
    router --> rgate
    rgate -->|no| blocked
    rgate -->|yes| checks

    checks --> emu
    emu --> merge
    merge --> filter
    filter --> approve
    approve --> drules
    drules --> dfunc
    dfunc --> dhost
    dhost --> preview
    preview --> smoke
    smoke --> promote

    pillars["<b>Why it is shaped this way</b><br/>• <b>Keyless</b> — WIF/OIDC; no service-account key exists<br/>  in GitHub secrets or on disk. A leaked env var is inert.<br/>• <b>Human-gated</b> — no unattended production change.<br/>• <b>Least blast radius</b> — only the changed surface deploys,<br/>  in the order data contract → backend → UI.<br/>• <b>Never serves unverified</b> — hosting goes preview → smoke → live,<br/>  which is why there is no rollback step."]
    promote --- pillars

    classDef gate fill:#fce8e6,stroke:#ea4335,stroke-width:2px,color:#111
    classDef pass fill:#e6f4ea,stroke:#34a853,color:#111
    classDef human fill:#fef7e0,stroke:#f9ab00,stroke-width:2px,color:#111
    classDef note fill:#fff,stroke:#5f6368,stroke-dasharray:3 3,color:#111
    class bguard,rgate,blocked gate
    class checks,emu,promote pass
    class approve human
    class pillars note
```

_Source: [`docs/diagrams/pipeline.mmd`](diagrams/pipeline.mmd)_
