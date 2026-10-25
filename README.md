# Luminova

**Membership recognition platform for JCI chapters.** Members earn points for showing
up and doing the work. The chapter gets a permanent, auditable record of who did what.

[![CI](https://github.com/JCIOriente/luminova/actions/workflows/ci.yml/badge.svg)](https://github.com/JCIOriente/luminova/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node 24](https://img.shields.io/badge/node-24-green.svg)](.nvmrc)

Built by and running at [JCI Oriente](https://jcioriente.org), the Santa Cruz de la
Sierra chapter of Junior Chamber International. Open for any chapter to use or adapt.

*[Leer en español](README.es.md) — versión resumida para capítulos.*

## The problem

A volunteer chapter has no record of who showed up. Attendance lives in a WhatsApp
thread, a printed sheet, or nobody's memory, so recognition at the end of the year comes
down to who was visible rather than who contributed. The annual board handover then
erases what little was tracked, because it lived in the outgoing board's spreadsheets.
Members who did the work quietly stop coming.

Luminova closes that loop. Attendance is captured at the door, points are derived by a
rule the chapter agreed on in advance, and the record survives the handover.

## How it works

1. The board creates a **program** or **project**, and the **activities** underneath it.
2. At the door, a scanner checks members in by **QR code**. Manual check-in is there for
   when a phone dies.
3. A Cloud Function derives **points** from the term's rule matrix — different values for
   directing, co-directing, being on the team, or attending.
4. **Leaderboards** and member profiles update. Points stay *provisional* until the
   director files the final report; then they're confirmed.

Three surfaces:

| App | What | Live |
|-----|------|------|
| `apps/spotlight` | Public site — programs, impact gallery, the board, contact form | https://jcioriente.org |
| `apps/backstage` | Admin dashboard — everything above, auth required | https://admin.jcioriente.org |
| `apps/beacon` | Cloud Functions — the recognition engine and public projections | — |

## Features

Everything listed here exists in the code today. Planned work is in the
[Roadmap](#roadmap), separately.

**Recognition engine**

- Each check-in produces one participation ledger row. The per-term aggregate is
  recomputed in a transaction, so concurrent scans at a busy door cannot lose points.
- A fixed per-term matrix of point-rule codes (directing, co-directing, team, assembly,
  course, national event, anniversary, trainer roles, and so on). Points are editable per
  term but not addable — the codes are an enum, not free-form rules.
- Editing a value is not retroactive. Every ledger row snapshots the points it was
  awarded at.
- Points are provisional until the initiative's completion wizard files the final report.

**Attendance**

- QR check-in with a scan modal, manual tap fallback, live roster, attendance percentage,
  and undo for mis-scans.
- The check-in window is bounded to the activity's own Bolivia-local day. Admins can
  backdate.
- An activity's start time and category lock once check-ins exist.

**Members and governance**

- Members console: create, edit, soft-delete (nothing is ever hard-deleted), profile
  photos, per-member points history and participation ledger.
- Positions catalog covering the executive committee, per-term board directorates, and
  standing commissions, with gendered titles and a per-term assignment map that preserves
  history across handovers.
- Login provisioning by invite email. There is no public signup.
- Member home with personal points, rank, participation history, and a personal QR
  credential.

**Roles and permissions**

- Coarse `action:Subject` permissions carried in a Firebase custom claim, resolved from
  role definitions plus per-member overrides.
- Roles are editable at runtime from an admin screen — a chapter can define its own
  without a deploy.
- Every client-side gate is mirrored in `firestore.rules`, and a test asserts the
  navigation gates and the rules agree. A permissions-only role can never reach the
  screens that mint permissions.

**Public site**

- Home, about (chapter history, mission, current board), impact showcase with per-project
  galleries, link-in-bio page, legal pages.
- The public site never loads the full Firebase SDK. It reads a small set of
  world-readable projections through the lite Firestore client. Private collections are
  not reachable from it.
- Contact form writes leads into a triage pipeline in the admin dashboard.
- Content — stats, timeline, mission, contact details, social links — is editable by the
  chapter president from an admin screen. No deploy needed to change the site copy.

**Platform**

- Both apps are installable PWAs.
- Notification composer with fan-out to an in-app inbox and best-effort web push.
- Firebase App Check (reCAPTCHA v3) on both apps.
- Around 250 test files, including Firestore and Storage security-rules suites that run
  against the emulator.
- CI on every pull request. Continuous deployment on merge, keyless and approval-gated.

## Roadmap

Not built. Listed because the groundwork is visible in the code and people ask.

- **Treasury and dues.** A `Treasury` role exists and has a dashboard layout, but there is
  no dues ledger, no payment records, and no automatic membership-status lapse. This is
  the largest missing piece.
- **Settings screen.** No `/settings` route yet; profile, theme and org settings are
  spread across other screens.
- **JCI award dossier export.** Projects are structured to become award submissions, but
  the export is blocked on award criteria we do not have yet.

See [`docs/roadmap.md`](docs/roadmap.md) for the full picture.

## Stack

React 19 · TypeScript 7 (strict) · TanStack Router + TanStack Query · React Hook Form +
Zod · Tailwind CSS v4 · CASL · Firebase (Auth, Firestore, Storage, Functions, Hosting) ·
Turborepo + pnpm workspaces · Node 24.

### Architecture

A pnpm monorepo. Two React SPAs and one Cloud Functions codebase, against a single
Firebase project.

| Package | What |
|---------|------|
| `@luminova/ui` | Token-driven component library shared by both apps |
| `@luminova/types` | Types and Zod schemas for every Firestore document; a framework-free `/engine` subpath is shared with the functions |
| `@luminova/auth` | CASL abilities, roles, permission codes |
| `@luminova/firebase` | Memoized client singleton with App Check and emulator wiring |
| `@luminova/utils` | Intl-only helpers (Bolivia-pinned datetime) |

The engine is the interesting part. Nothing on the client writes points:

```
Admin or scanner records a check-in in backstage
  → writes /checkIns/{id}
  → beacon awardPoints trigger fires
  → reads the activity + the term's point rule
  → derives /participations/{activityId__memberId__role}
  → recomputes /memberPoints/{memberId__termId} transactionally
  → mirrors members.totalPoints
  → leaderboard and member profiles read the aggregate
```

Points, custom claims, and every public projection are written only by Cloud Functions
running on the Admin SDK. `firestore.rules` denies clients write access to all of them.
The same rule applies to soft deletes: rules deny hard `delete` on the collections that
matter.

More: [`docs/architecture.md`](docs/architecture.md) ·
[`docs/data-models.md`](docs/data-models.md) · [`docs/features.md`](docs/features.md).

## Quickstart

You need **Node 24**, **pnpm** (via `corepack enable`), the **Firebase CLI**, and a
**Java runtime** — the Firestore emulator runs on the JVM.

```bash
git clone https://github.com/JCIOriente/luminova.git
cd luminova
nvm use                       # Node 24, pinned in .nvmrc
corepack enable
pnpm install
pnpm dev
```

No `.env` file is needed: `pnpm dev` reads the Firebase config from the brand profile
`brand/` selects and always talks to the local emulators, so nothing you do locally
touches a real project.

`pnpm dev` boots the Firebase emulator suite, rebuilds the functions so triggers are not
stale, seeds Firestore and Auth, and starts both dev servers.

| Surface | URL | Sign in with |
|---------|-----|--------------|
| Spotlight (public) | http://localhost:5173 | — |
| Backstage (admin) | http://localhost:5174 | `admin@jci.cc` / `Secret1` |
| Emulator UI | http://localhost:4100 | — |

**One more step on a fresh database.** The seed deliberately leaves the points matrix
empty. In backstage, open **Reglas de puntos** (`/point-rules`) and click
**Inicializar**. Until you do, check-ins record attendance but award zero points.

Emulator state persists to `emulator-data/`, so what you create survives a restart.

On macOS with Apple Silicon, Homebrew's OpenJDK is not on `PATH` by default:
`brew install openjdk` then `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`.

Full developer guide, including the quality gate and the repository layout:
[CONTRIBUTING.md](CONTRIBUTING.md).

## Adopting it for your chapter

Luminova is not multi-tenant: one deployment serves one chapter. To run it for yours, fork
it and create a brand profile with `pnpm brand:init` (names, places, site addresses). Try it
on your computer first: the profile starts local-only, with no Firebase project and nothing
deployed. When your chapter is ready to go live, `pnpm brand:init --connect` attaches your
Firebase project and `pnpm brand:provision` walks through the Google Cloud setup. The JCI marks are **not** covered by this repository's license — see
[NOTICE](NOTICE).

The whole path, each step with its command: [`docs/adopting.md`](docs/adopting.md).
Considering it? [Open an adoption issue](https://github.com/JCIOriente/luminova/issues/new?template=chapter_adoption.yml).

## Deployment

Merging to `main` runs CI, then a deploy workflow authenticates to Google Cloud through
Workload Identity Federation and, after a one-click approval, deploys only the surface
that changed — rules, then functions, then hosting. No service-account key is stored
anywhere.

Manual deploys are available as a fallback:

```bash
pnpm deploy:rules       # firestore + storage rules
pnpm deploy:indexes     # firestore indexes
pnpm deploy:functions   # beacon
pnpm deploy:hosting     # release build of the profile brand/ selects (brand:pull first), then deploys
pnpm deploy:all
```

Pipeline, trust model, validation and rollback runbooks: [`docs/ci-cd.md`](docs/ci-cd.md).

## Contributing

Contributions are welcome, from chapters and developers alike. Start with
[CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions and the quality gate.

- Bugs and proposals: [Issues](https://github.com/JCIOriente/luminova/issues)
- Setup and adoption questions: [Discussions](https://github.com/JCIOriente/luminova/discussions)
- Security: privately, per [SECURITY.md](SECURITY.md) — never a public issue

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[Apache License 2.0](LICENSE).

The license covers the code. It does not grant rights to the JCI name and marks, the JCI
Oriente logos and icons in `brand/jci-oriente/assets/`, or the chapter's own content shipped as seed
data. See [NOTICE](NOTICE) before you fork.

## Origin

Luminova was built at **JCI Oriente** — Junior Chamber International, Santa Cruz de la
Sierra, Bolivia — to solve our own recognition problem, and is maintained by the
chapter's Innovation Committee.

It is open source because every chapter has this problem and none of us should have to
solve it twice. If you adapt it, we would like to hear about it.
