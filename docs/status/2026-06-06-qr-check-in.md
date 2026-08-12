# A3 — QR Attendance Check-in (status)

_Date: 2026-06-06 · Branch: `feat/qr-check-in` · Roadmap: A3 (bundled minimal E4 + thin D1)_

## Shipped

The day-of attendance flow: a logged-in Admin/ProjectManager picks an activity,
scans a member's personal QR (or taps a manual fallback), which writes a
`checkIns/{id}` doc; A2's `awardPoints` derives the participation + points.

- **`@luminova/types`** — promoted `CheckIn` to the pure `@luminova/types/engine`
  subpath + added `checkInSchema` (zod, root barrel). Beacon and backstage now
  share one contract. Engine subpath stays zod-free.
- **`@luminova/ui`** — `QrCode` (qrcode.react) + `QrScanner` (@zxing/browser camera
  decode), both exposed via **deep import paths** (`@luminova/ui/qr-code`,
  `@luminova/ui/qr-scanner`) so qrcode.react and @zxing stay out of the eager
  bundle. Added a `qr` icon + `disabled` support on the native `Button`.
- **backstage `activities`** — thin Activity create form (RHF + `activitySchema`,
  datetime-local → UTC Timestamp) + table + repository + `/activities` route.
- **backstage `check-in`** — `/check-in` mobile-first page: ActivityPicker +
  lazy QrScanner + live roster + searchable manual-tap list. `CheckInRepository`
  writes a deterministic-id (`activityId__memberId__role`) doc with
  `serverTimestamp()`; re-scans are skipped client-side (idempotent).
- **A5 profile** — member's personal QR panel (`jcioriente:member:{id}`, no PII).
- **Nav + CASL** — "Actividades" + "Check-in" nav under a new "Reconocimiento"
  group; ProjectManager gained `manage Activity` + `checkIn Attendance`; the
  `/check-in` page is capability-gated.
- **`firestore.rules`** — new `activities` collection (read signedIn; create/update
  Admin|ProjectManager; delete false); Scanner `checkIns` create now requires the
  member doc to exist (no phantom check-ins); added a `participations` read rule
  (was falling to deny-all, breaking the A5 ledger read in prod).
- **beacon** — fixed `awardPoints` to initialize the admin app at module load (the
  lazy init raced the functions-runtime admin stub → `default app does not exist`).

## Verification

- Unit/integration: types 47, beacon 35, backstage 98, @luminova/ui 8, @luminova/auth
  16 — all green. Prettier + knip clean; audit = 1 moderate (pre-existing I5).
- **Firestore rules**: 57 tests against the live emulator (activities matrix,
  Scanner member-exists, participations read).
- **Bundle**: @zxing (~468 kB) is an on-demand `qr-scanner-*` chunk loaded only on
  `/check-in`; qrcode.react moved out of the eager vendor chunk to the on-demand
  profile chunk; main `index` chunk unchanged (~290 kB).
- **Security**: `/security-review` clean (no findings ≥8); `firestore-security-reviewer`
  findings H1/M1/L1 fixed in-branch.
- **Emulator e2e (NEW — closes A2 follow-up #6)**: `tools/scripts/e2e-check-in.mjs`
  ran the real chain against the functions emulator — `checkIn` → `awardPoints` →
  `participation` (AttendAssembly, 4 pts, confirmed) → `memberPoints` (cumulative 4)
  → `members.totalPoints` 4. PASS.

## Deferred (designed-not-out)

- **A4 offline queue** — `CheckInRepository.create` is the wrap seam.
- **Realtime roster** — v1 uses invalidate-after-write; `onSnapshot` later.
- **Scanner designation UI** — needs B1 uid-provisioning + D4 role UI. The
  Scanner-role + `scannerEventIds` path is rules-enforced + tested but has no UI;
  v1 is operated by Admin/PM (the `checkIns` rule already allows them).
  > **2026-08-05 — no longer true.** `scannerEventIds` was removed with the built-in
  > role set (`docs/specs/builtin-role-set.md` C2). Scanner now carries coarse
  > `read:Activity` + `checkIn:Attendance`, and the only Scanner-specific restriction
  > left in `firestore.rules` is the `role == 'Attendee'` conjunct — there is no event
  > scoping to enforce or test.
- **Director/team roles** — v1 manual tap = `Attendee`; other roles via the
  documented Admin/PM trust model (follow-up #7).
- **Full Activity CRUD** (edit/delete, project/program parent combobox via E1/E5) — D1.
- **prod functions packaging** — emulator/raw-node now works; a bundler is still
  the deploy norm (follow-up #6 remainder), plus the composite index deploy.

## Deferred rules-hardening surfaced (not blocking, consistent with existing patterns)

- `activities` / `checkIns` reads are `signedIn()` (a Scanner can read other
  events' activities + the full attendance roster) — matches the
  events/terms/pointRules pattern; tighten with the rules-hardening track.
- Admin/PM can still write a `Director`-role check-in for any memberId (documented
  v1 trust model, follow-up #7).
