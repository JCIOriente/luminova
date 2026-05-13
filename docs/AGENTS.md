# Agents Guide

## Mission & Capabilities
- **Backstage (admin)** – manage members, events, point rules, and allies stored in Firestore; uses Firebase Auth for access control.
- **Spotlight (marketing)** – public-facing React site showcasing programs and contact information.
- **Beacon (cloud functions)** – awards points to members when events are created/updated by aggregating `pointRules`.
- Shared UI primitives live in `libs/ui`; domain types in `libs/types`; Tailwind utilities via `libs/utils`.

## How the System Works
- Client apps hydrate Firebase SDK credentials from environment variables (`FIREBASE_*`) and optionally connect to emulators when `FIREBASE_EMULATOR_ENABLED=true` (see `apps/backstage/src/libs/firebase.ts`).
- Data fetching/mutations rely on React Query repositories under each feature folder (e.g., `features/members/repositories/memberRepository.ts`).
- Forms use React Hook Form + Zod schemas to validate inputs before calling repositories.
- The cloud function `apps/beacon/src/main.ts` listens on `/events/{id}` writes to materialize monthly `memberPoints`.

## Getting Started Locally
1. Install dependencies: `yarn install`.
2. Populate `.env` for Backstage using `apps/backstage/env-example.env` and export variables for Vite.
3. Define Nx targets for Backstage/Spotlight (see `docs/ARCHITECTURE.md` notes) or run Vite directly: `nx exec --project=backstage -- vite dev` until proper targets exist.
4. Start Firebase emulators if you need local services: `yarn firebase:emulators:start`.
5. Build Beacon before deploying functions: `nx build beacon`.
6. Run schema backfills against Firestore when adopting the latest release: `yarn backfill:firestore -- --dry-run` to preview, then rerun without `--dry-run` using production credentials.

## Documentation Map
- **Architecture overview** – `docs/ARCHITECTURE.md`
- **Functional specs** – `docs/SPECS.md`
- **Remediation roadmap** – `docs/TASKS.md`
- Firebase configuration – `firebase.json`, `firestore.rules`

## Git Workflow (Feature Branch Model)
1. Create an issue/task and new branch from `master`: `git checkout -b feature/<slug>`.
2. Keep branches focused (one feature/fix); commit early and rebase on latest `master` before opening PRs.
3. Run lint/tests locally prior to push (add missing Nx targets to enable `nx lint <project>` and `nx test <project>`).
4. Open a PR targeting `master`; request review and address feedback via additional commits (avoid force-push unless necessary).
5. Once approved, squash-merge (or rebase merge per repo policy), delete the feature branch, and pick up the next task by starting again from updated `master`.

## Where to Look Next
- For UI patterns: `libs/ui/src/lib/ui`.
- For data access examples: `apps/backstage/src/features/*/repositories`.
- For authentication: `apps/backstage/src/features/auth`.
- For Firebase deployment/setup: `firebase.json`, `firestore.rules`, `firestore.indexes.json`.
