# Architecture

## Workspace Topology
- Monorepo managed with Nx 20.4; TypeScript configured via `tsconfig.base.json` with shared path aliases (`@luminova/*`).
- Applications live under `apps/`:
  - **backstage** – React 19 + Vite admin console that orchestrates feature modules (members, events, point rules, allies) and relies on Firebase Auth/Firestore/Storage via React Query.
  - **spotlight** – React 19 marketing site rendered with Vite; currently static content with Tailwind-driven layout components.
  - **beacon** – Firebase Functions (Node 22 target) compiled from TypeScript; exposes Cloud Function `awardPoints` to aggregate member points when `/events/{id}` changes.
- Shared libraries sit under `libs/`:
  - **ui** – Shadcn/Tailwind based primitives (buttons, forms, overlays, toast) exported through `@luminova/ui`.
  - **types** – Lightweight TypeScript utility types for React Query pagination (`QueryResult`, `PaginatedData`, etc.).
  - **utils** – Currently only `cn` (className merger) exposed as `@luminova/utils`.

## Runtime Architecture
- **Client apps** use React Query as a data-access layer. Feature hooks encapsulate Firestore CRUD calls via repository classes, emitting POJOs directly to UI components.
- **Firebase integration**:
  - `apps/backstage/src/libs/firebase.ts` bootstraps Firebase App, Firestore, Auth, and Storage, with optional emulator connectivity toggled by `FIREBASE_EMULATOR_ENABLED`.
  - Authentication handled via Firebase Auth email/password; auth state is surfaced through `useAuth`.
  - Firestore collections in use: `members`, `events`, `pointRules`, `allies`, plus computed `memberPoints` written by the `beacon` function.
  - Storage buckets store member profile images under `members/{filename}`.
- **Cloud Function (`beacon`)** listens to Firestore writes on `events/{id}`, reads role-specific point rules, and writes aggregated scores into a time-bucketed subcollection (`memberPoints/{year}/{month}/{eventId}`).

## Tooling & Build
- Vite drives the React builds; output artifacts expected in `dist/apps/<app>`.
- Firebase Hosting targets `spotlight` and `backstage` as defined in `firebase.json`.
- Firebase Functions deployment consumes the bundle at `dist/apps/beacon`.
- Nx project configuration for `backstage` and `spotlight` currently lacks explicit `targets`, so `nx serve/build` needs to be defined before CI/CD automation can rely on Nx task runners.
- Emulators are configured (`firestore:4010`, `functions:4020`, `auth:4030`, `hosting:4000`) with dashboard at `4100`.

## Cross-Cutting Concerns
- **State management**: relies solely on React Query; mutations invalidate collection-level queries (`['members']`, `['events']`, etc.).
- **Forms & validation**: React Hook Form + Zod schemas per feature (members, point rules, events, allies) ensuring minimal client-side validation.
- **Styling**: Tailwind CSS with utility merger from `@luminova/utils/cn`.
- **Localization**: Static strings predominantly in English with some Spanish copy in Spotlight; no i18n framework yet.
- **Security**: Firestore rules currently allow unrestricted read/write until `2025-07-31` (`firestore.rules:15-18`); rules must be hardened for production.

## Notable Technical Debt
- Firestore repositories mutate and return raw snapshots without normalization; server timestamps, pagination cursors, and error handling are manual and inconsistent.
- Auth bootstrap (`useAuth`) relies on side effects updating React Query cache post-render, causing race conditions on protected routes.
- Nx configuration gaps (missing targets) block reproducible builds for the React apps.
- Cloud Function `awardPoints` re-queries entire `pointRules` collection for every event change, lacks transactionality, and does not handle event deletions or retries.
