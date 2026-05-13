# Specs

## Backstage (Admin Console)
- **Authentication**
  - Email/password login backed by Firebase Auth (`AuthService.login/logout/observe`).
  - Session gating through `<ProtectedRoute>` wrapping all routes except `/login`.
- **Dashboard**
  - Placeholder route (`Dashboard.tsx`) awaiting analytics/widgets definition.
- **Members Management**
  - List members in Firestore ordered by insertion (no explicit sort).
  - Infinite scroll pagination via `usePaginatedMembers(pageSize=10)` with manual “Load more”.
  - Create/edit member records using React Hook Form + Zod with fields: `name`, `email`, `phone`, `role`, optional `profilePicture`.
  - Upload profile pictures to Firebase Storage (`members/{filename}`) on creation; updates currently overwrite with empty string when no file provided.
  - Delete member documents via `useDeleteMember`.
- **Events Management**
  - Events stored in Firestore `events` collection; fields: `type`, `name`, `description`, `scope`, `directorId`, `coDirectorIds`, `collaboratorIds`, `participantIds`, `parentId`, `startDate`, `endDate`.
  - Forms provide combobox selection for directors and multi-select via `MemberSelector` for roles.
  - List/table renders raw timestamps (numbers) and resolves director name client-side.
- **Point Rules**
  - CRUD for `pointRules` collection with fields: `type`, `role`, `points`, `description`.
  - Tables surface rules and allow inline edit/delete.
- **Allies**
  - CRUD around `allies` collection with fields: `companyName`, `personInCharge`, `phone`, `email`.
- **Settings**
  - Placeholder route awaiting configuration options.
- **Shared UI**
  - Components drawn from `@luminova/ui` library (Shadcn-based) and `MemberSelector` for multi-select scenarios.

## Spotlight (Marketing Site)
- **Routing**
  - BrowserRouter with layout (`Layout` component) wrapping `Home`, `About`, `Contact`.
  - Navigation header/footer with social links, contact info, and placeholder program links.
- **Home Page**
  - Hero section with CTA buttons.
  - Static sections outlining programs, events teaser, and benefits.
- **About Page**
  - Static narrative of mission, vision, and leadership focus.
- **Contact Page**
  - Static contact details and simple contact form stub (no submission logic).
- **Styling**
  - Tailwind CSS across pages with components from `@luminova/ui`.

## Beacon (Cloud Functions)
- **Award Points Trigger**
  - Trigger: Firestore `onDocumentWritten('/events/{id}')`.
  - Behavior: Calculate member point totals per event/month using `pointRules` collection and write aggregated data into `memberPoints/{year}/{month}/{eventId}` document keyed by member ID.
  - Logging: Prints operation type and write time.
  - Error handling: `try/catch` around Firestore write with console logging.
- **Dependencies**
  - Uses Firebase Admin SDK (initializeApp, getFirestore) and typed helper functions for aggregation.

## Shared Non-Functional Expectations
- TypeScript-first codebase using React 19 and Vite.
- Testing scaffolding via Vitest (unit) and Playwright (e2e) generated but not populated with meaningful tests.
- ESLint + Prettier configured via Nx root config; Tailwind for styling.
- Firebase emulators configured for local development (`firebase:emulators:start` script).
