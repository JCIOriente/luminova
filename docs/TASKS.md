# Remediation Tasks

## Critical
- Harden authentication bootstrap so protected routes wait for Firebase before deciding (`apps/backstage/src/features/auth/hooks/useAuth.ts`); ensure the query key stays in sync with invalidations and handle initial loading state in `ProtectedRoute`.
- Replace permissive Firestore rules (`firestore.rules:15-18`) with role-based access that matches Backstage needs before launch.
- Define proper Nx targets for Backstage and Spotlight (`apps/backstage/project.json`, `apps/spotlight/project.json`) so dev/build/test tasks can run predictably in CI/CD.

## Completed
- Soft-delete semantics for members (active/deletedAt metadata, repository + hooks, UI sanitisation, soft delete via `updateDoc`).
- Normalised member data models to accept Firestore URLs vs `File` uploads and preserve stored avatars (`memberRepository`, `MemberInputSchema`).
- Unified React Query cache keys for members (paginated + full list) to avoid stale tables and selectors.
- Event dates validated and persisted as Firestore `Timestamp`s; UI now surfaces date pickers and formatted output.
- Beacon function now scopes point-rule lookups and cleans up aggregated documents on event deletion.

## High Priority
- Run `yarn backfill:firestore` (first with `-- --dry-run`) across staging and production projects to apply member and event migrations safely.
- Establish a repeatable fix for Nx plugin worker failures (investigate `.nx/workspace-data` corruption, document `nx reset`/cache strategy, consider switching lint targets to `nx:run-commands`) so CI lint/build jobs can execute.

## Medium Priority
- Add meaningful unit/integration tests for repositories and forms (Vitest) and update Playwright specs to reflect actual UI flows (`apps/backstage-e2e/src/example.spec.ts`).
- Factor shared Firestore access patterns into reusable utilities (pagination, error handling) instead of manual loops in each repository.
- Provide consistent loading/empty/error states across tables (e.g., reuse `EmptyTableRow` but fix mismatched `colSpan` values in `PointRuleTable.tsx`).
- Document deployment playbooks for hosting & functions (extend `docs/ARCHITECTURE.md` once automation is defined).

## Nice to Have
- Implement optimistic UI updates or skeletons for slow Firebase queries (members/events/point rules).
- Localize marketing copy and admin UI strings; consider i18n support for Spanish/English toggle.
- Introduce role-based authorization and structured logging/monitoring for critical mutations.
