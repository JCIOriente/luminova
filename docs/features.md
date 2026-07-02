# Feature Specs

Acceptance criteria and UX flows for each Backstage feature.

---

## Auth

### Login
- Route: `/login` (public, `_auth.login.tsx`)
- Form fields: email, password
- Validation: email format, password min 6 chars
- On submit: Firebase `signInWithEmailAndPassword`
- On success: navigate to `/`
- On error: display Firebase error message inline (not toast)
  - `auth/user-not-found` → "No account found with this email"
  - `auth/wrong-password` → "Incorrect password"
  - `auth/too-many-requests` → "Too many attempts. Try again later"
- No public signup — member accounts are provisioned via the invite flow
  (`provisionMemberLogin` callable sends a Firebase invite email; the member sets
  their password)

### Password Recovery
- `/forgot-password`: enumeration-safe reset request (always shows success copy)
- `/reset`: verifies the `oobCode`, then sets a new password against the policy
  (min 6 + lower/upper/digit) with a live requirements checklist

### Protected Routes
- All `_app.*` routes: check auth state in `beforeLoad`
- If no user → redirect to `/login`
- Redirect preserves `redirect` search param so user returns to intended page after login

### Logout
- Sidebar logout button
- Calls Firebase `signOut()`
- Navigate to `/login`
- Clear TanStack Query cache

---

## Members

### Members Page (`/members`)
- `DataTable` with columns: Miembro (avatar + name + email), Cargo (current-term
  position), Estado, Desde (join date), Puntos, Actions
- Client-side search / filter chips / column sort (server-side pagination deferred)
- Filter: show active members only by default
- Actions per row: Edit, Delete (soft)
- Row click → member detail (`/members/$memberId`): points summary, byMonth chart,
  participation ledger, permissions panel

### Add Member
- "Add Member" button → opens Sheet from right
- Fields: Nombre*, Correo*, Género*, Teléfono, Profesión, Fecha de nacimiento*,
  Cargo (position from catalog), Comisiones, Fecha de ingreso*, Estado*
- On save: create Firestore doc, close sheet, invalidate query, show success toast

### Edit Member
- Click edit icon → opens Sheet pre-filled with current values
- Same fields as Add; profile picture upload (square-crop, client downscale) lives in
  the edit drawer — stored at `members/{id}/profile.jpg` in Firebase Storage
- ExecutiveCommittee users get a positions-only edit (rules enforce it)
- On save: update Firestore doc, close sheet, invalidate query, show success toast

### Soft Delete Member
- Click delete icon → confirmation Dialog: "Are you sure? This will deactivate {name}."
- On confirm: set `active: false`, `deletedAt: serverTimestamp()`
- Show success toast: "{name} has been deactivated"

---

## Initiatives (Programs & Projects)

> The v2 "Events" feature was superseded by the Recognition Engine's initiatives +
> activities model. There is no `/events` route.

### Initiatives Page (`/initiatives`)
- Unified card grid over `programs` + `projects` (shared `InitiativeCore` shape)
- Create/edit with roster selects (Director Combobox, Co-Directors / Team MultiSelect),
  category (area of opportunity), date range, status
- Detail at `/initiatives/$type/$id`: roster, photo gallery, child activities
- Completion wizard = the final-report ceremony (impact metrics + closing summary);
  filing the report flips child-activity points provisional → confirmed
- No hard delete anywhere (rules deny `delete`)

### Activities Page (`/activities`)
- Card grid of attendable activities (category, `location` physical/virtual, status)
- Detail at `/activities/$id` with tabs: Resumen · Galería · Check-in
- Check-in tab: QR scan modal (member QR) + manual tap fallback, live roster,
  attendance ring/percent, undo check-in (mis-scan correction)
- Check-ins write `checkIns` docs → beacon `awardPoints` derives participations
- `startAt`/`category` lock once check-ins exist; check-in window = the activity's
  own Bolivia-local day (Admin may backdate)

---

## Point Rules

### Point Rules Page (`/point-rules`)
- Fixed 16-row **Mejor Miembro Individual** matrix per term — codes are the
  `PointRuleCode` enum in `@luminova/types/engine`, not free-form rules
- Empty term → "Inicializar" button (perm `create:PointRule`) seeds the current-year
  term + the 16 rows from `DEFAULT_POINT_VALUES` / `POINT_RULE_LABELS`
- Editing is **points-only**, inline in the table — rows cannot be added or deleted
- Editing a value does NOT retroactively affect already-awarded participations
  (each ledger row snapshots `basePoints` at award time)

---

## Allies

### Allies Page (`/allies`)
- Table with columns: Empresa (logo + name), Encargado, Teléfono, Correo, Categoría,
  Actions
- Sorted by company name (es locale)
- Actions: Edit, Delete (soft)

### Add / Edit Ally
- Sheet with fields: Empresa*, Encargado*, Teléfono*, Correo*, Categoría, Logo upload
- Public fields (name + logo + category) are projected by beacon into the world-read
  `allyShowcase` collection for the spotlight allies wall

### Delete Ally
- Confirmation dialog
- **Soft delete** (`active: false` + `deletedAt`) — rules deny hard delete

---

## Dashboard (`/`)

Real data since B3 (#115) — the mock overview is gone:
- Aggregates: active member / ally counts, points + attendance stats
- Upcoming activities list + recent check-ins / activity feed (real Firestore reads)
- Honest empty/loading states for anything without a backend yet
  (notifications bell → K1, money widgets → J5)
- Widget order/visibility is role-aware (`boardHomeLayout(roles)`, B2)

---

## Other shipped surfaces

- **`/me`** — member home: points + rank, personal QR credential, participation ledger
- **`/leaderboard`** — annual + monthly (top 3 + Best of Month), eligibility flags
- **`/members/$memberId`** — member detail: points history + permissions panel
- **`/positions`** — CEL/JDL/comisiones catalog (gendered cargos, CEL seed button)
- **`/permisos`** — runtime role/permission admin (custom roles, per-member overrides)
- **`/config`** — president-editable site config consumed by the public spotlight site

## Settings

Not built yet — there is no `/settings` route. A real settings page (profile + theme +
org + role-management home) is roadmap **D4/N5**.

---

## Shared UX Patterns

### Toast Notifications
- Success feedback via the bespoke `@luminova/ui` `Toast` component (local state,
  auto-dismiss ~3s)
- Errors render inline (form/field errors or in-place query error states), not toasts

### Empty States
- Tables with no data: centered illustration + message + CTA button
  - Members: "No members yet. Add your first member."
  - Events: "No events yet. Create your first event."

### Loading States
- Tables: skeleton rows (3 rows of shimmer)
- Sheets: button shows spinner, fields disabled during save

### Error States
- Query errors: error message + retry button in place of table content

### Form Validation
- Errors shown inline below each field
- Submit button disabled if form invalid
- All required fields marked with *
