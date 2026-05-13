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
- No signup flow — accounts created manually in Firebase Console

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
- Table with columns: Profile Picture, Name, Email, Role, Total Points, Status, Actions
- Paginated: 10 per page, cursor-based (infinite scroll or next/prev buttons)
- Filter: show active members only by default
- Actions per row: Edit, Delete (soft)

### Add Member
- "Add Member" button → opens Sheet from right
- Sheet title: "Add Member"
- Fields: Name*, Email*, Phone, Role*, Profile Picture (file upload)
- Profile picture: upload to Firebase Storage at `members/{timestamp}-{filename}`, store URL
- On save: create Firestore doc, close sheet, invalidate query, show success toast

### Edit Member
- Click edit icon → opens Sheet pre-filled with current values
- Same fields as Add
- Profile picture: shows current image, can replace
- On save: update Firestore doc, close sheet, invalidate query, show success toast

### Soft Delete Member
- Click delete icon → confirmation Dialog: "Are you sure? This will deactivate {name}."
- On confirm: set `active: false`, `deletedAt: serverTimestamp()`
- Show success toast: "{name} has been deactivated"

---

## Events

### Events Page (`/events`)
- Table with columns: Name, Type, Scope, Director, Date Range, Actions
- No pagination (events volume is manageable)
- Actions: Edit, Delete

### Add Event
- "Add Event" button → opens Sheet
- Fields:
  - Type* (Select: Program, Project, Activity, Gala)
  - Name*
  - Description (Textarea)
  - Scope* (Radio: Local, National)
  - Start Date* (Date picker)
  - End Date* (Date picker — must be ≥ start date)
  - Director* (Combobox — search active members)
  - Co-Directors (Multi-select — active members, excludes already-selected)
  - Collaborators (Multi-select — active members)
  - Participants (Multi-select — active members)
  - Parent Event (Combobox — only shown when Type = Activity)

### Edit Event
- Same as Add but pre-filled
- Director, co-directors, collaborators, participants load from member IDs

### Delete Event
- Confirmation dialog
- Hard delete (events are the source of truth, soft delete not needed)
- Cloud function automatically removes memberPoints entry on delete

---

## Point Rules

### Point Rules Page (`/point-rules`)
- Table with columns: Description, Event Type, Role, Points, Actions
- Optionally group by Event Type for readability
- Actions: Edit, Delete

### Add Point Rule
- "Add Rule" button → opens Sheet
- Fields:
  - Description*
  - Event Type* (Select: Program, Project, Activity, Gala)
  - Role* (Select: Director, CoDirector, Collaborator, Participant)
  - Points* (Number input, min 0)
- Warn if a rule for that type+role already exists

### Edit/Delete Point Rule
- Same pattern as other features
- Deleting a rule does NOT retroactively affect existing memberPoints

---

## Allies

### Allies Page (`/allies`)
- Table with columns: Company Name, Person In Charge, Phone, Email, Actions
- Sorted by company name
- Actions: Edit, Delete

### Add / Edit Ally
- Sheet with fields: Company Name*, Person In Charge*, Phone*, Email*
- Standard CRUD, no special logic

### Delete Ally
- Confirmation dialog
- Hard delete

---

## Dashboard (`/`)

### Summary Cards (v2 launch — simplified)
- Total active members
- Total events this year
- Top 3 point earners (from memberPoints collection)

These can be placeholder cards initially and populated in a follow-up session.

---

## Settings (`/settings`)

Placeholder page for v2 launch. Future: org profile, user management.

---

## Shared UX Patterns

### Toast Notifications
- Success: green, auto-dismiss 3s
- Error: red, auto-dismiss 5s
- Use shadcn `useToast` hook

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
