# A3 — QR Attendance Check-in (design)

_Date: 2026-06-06 · Branch: `feat/qr-check-in` · Roadmap: A3 (depends F1, F3, A2; bundles minimal E4 + thin D1)_

## Goal

Mobile-first attendance check-in: a logged-in Admin/ProjectManager scans a
member's personal QR (or taps a manual fallback) → writes a `checkIns/{id}` doc →
A2's `awardPoints` (unchanged) derives the participation + points. Live roster of
who has checked in.

## Scope decisions (brainstorm)

- **Bundle minimal into A3** — one `feat/qr-check-in` branch. Just-enough QR
  widgets in `@luminova/ui` + a thin Activity create form/picker in backstage.
  E4 (full QR widgets) and D1 (full Events/Activities CRUD) harden these later.
- **Activity source** — thin Activity create form + picker, using the existing F3
  `activitySchema`. Real `activities/{id}` docs with a real `startAt` (drives the
  punctuality factor).
- **QR payload** — namespaced member doc id: `jcioriente:member:{memberDocId}`.
  Opaque, non-PII; the prefix lets the scanner reject foreign QRs.
- **CheckIn type** — promoted to `@luminova/types/engine` (+ a `checkInSchema` in
  the root barrel). Beacon (reads) and backstage (writes) share one contract.
- **Operator (v1)** — Admin/ProjectManager only. The `checkIns` rule already lets
  them create any check-in with no `scannerEventIds`. The Scanner-role +
  `scannerEventIds` path stays rules-enforced and tested, but the UI to
  *designate* a per-event scanner is deferred (needs B1 uid-provisioning + D4).

## Architecture / data flow

```
Member QR (jcioriente:member:{memberId})  ── shown on A5 profile
        │  scanned by Admin/PM on mobile (or manual tap)
        ▼
backstage /check-in  ── pick active Activity ── QrScanner decode ──┐
        │ (manual tap from member roster, role=Attendee)            │
        ▼                                                           │
CheckInRepository.create
  → checkIns/{activityId__memberId__Attendee}   (deterministic id)
     { memberId, activityId, role:'Attendee', checkInAt: serverTimestamp() }
        │  (A2 trigger, UNCHANGED)
        ▼
awardPoints → participations + memberPoints     ← A3 NEVER writes these
```

Re-scan = same deterministic id. The live roster already lists checked-in members,
so the client **skips the write** when a member is already present (avoids a
create-on-existing permission error, since `checkIns` is create-only/immutable).
Live roster = `checkIns where activityId==`, invalidated after each successful write.

## Units

### `@luminova/types`
- `engine/check-in.ts` — `CheckIn` type (neutral `Timestamp` from `./timestamp.js`),
  exported from `engine/index.ts` (the pure, zod-free subpath). Beacon imports it
  and drops its local `CheckIn` (keeps `validateCheckIn`; admin `Timestamp`
  satisfies the neutral interface via `toMillis`/`toDate`).
- `engine/check-in-schema.ts` — `checkInSchema` (zod): `memberId` + `activityId`
  clean-id (no `/`, no `__`), `role` enum. **Exported from the root `@luminova/types`
  barrel only** (engine subpath stays zod-free, like `activity-schema`). `checkInAt`
  is server-set, not in the schema.

### `@luminova/ui` (generic — no domain knowledge)
- `QrCode` — renders a QR for an arbitrary string (QR-encode lib). SVG-based.
- `QrScanner` — camera viewport + decode loop, `onScan(text)` + `onError`. Manages
  `getUserMedia` lifecycle (start/stop, cleanup on unmount). Imported lazily.

### `apps/backstage`
- `lib/member-qr.ts` — pure `encodeMemberQr(id)` / `decodeMemberQr(text)` for the
  `jcioriente:member:{id}` envelope; `decodeMemberQr` returns `null` for foreign or
  malformed QRs. Shared by A5 profile + check-in.
- `features/activities/`
  - `repositories/activity-repository.ts` — `create(input)`, `getByTerm(termId)`
    (where `termId ==`, JS-sorted by `startAt` desc).
  - `activity-mapper.ts` — pure `toActivityCreateDoc(input, termId)`: sets
    `termId`, `organizers={directorId, coDirectorId:null}`, `status='Programada'`,
    `startAt` (datetime-local string → `Timestamp`, UTC-consistent), nullable
    `parentType`/`parentId`.
  - `hooks/` — `useActivitiesByTerm`, `useCreateActivity` (invalidate on write).
  - `components/ActivityForm.tsx` — RHF + Zod (`activitySchema`) in a Sheet;
    category select, datetime-local `startAt`, nullable parent fields.
  - `components/ActivityTable.tsx` — list (category label, startAt, status Badge).
  - route `_app.activities.tsx` — list + create.
- `features/check-in/`
  - `repositories/check-in-repository.ts` — `create(checkIn)` (validate via
    `checkInSchema`, deterministic id `${activityId}__${memberId}__${role}`,
    `checkInAt: serverTimestamp()`), `getByActivity(activityId)` (roster).
  - `roster.ts` — pure: `alreadyCheckedIn(roster, memberId)`,
    `buildRosterEntries(checkIns, members)` (resolve names, sort).
  - `hooks/` — `useActivityCheckIns(activityId)`, `useCreateCheckIn` (invalidate
    roster).
  - `components/ActivityPicker.tsx` — pick the active activity to scan into.
  - `components/Roster.tsx` — live list of checked-in members.
  - `components/ManualTapList.tsx` — searchable active-member list; tap →
    check-in (role Attendee); disables already-checked-in members.
  - route `_app.check-in.tsx` — mobile-first: ActivityPicker → QrScanner +
    Roster + ManualTapList. **Lazy route chunk** (heavy QR/camera libs).
- A5 profile (`_app.members_.$memberId.tsx`) — add a member-QR panel
  (`encodeMemberQr` + `QrCode`), so the board can display a member's QR to scan.
- Sidebar — "Actividades" + "Check-in" entries (gated to Admin/ProjectManager).

### `firestore.rules`
- Add `activities` match: `read: signedIn()`; `create, update:
  hasAnyRole(['Admin','ProjectManager'])`; `delete: false`.
- `checkIns` unchanged (already governs Admin/PM + Scanner-Attendee-scoped create,
  immutable).

## Dependencies (`secure-dep-vetting` before code)

- **QR encode** (generator) — candidate `qrcode` (framework-free, SVG string).
- **QR decode + camera** — candidate `@zxing/browser` / `html5-qrcode` / `jsqr`.
  Vetting picks on Node 24 compat / maintenance / CVE / bundle size.
- `bundle-budget-watcher` after — the scanner route is lazy-loaded so the libs
  don't enter the main chunk.

## Testing (TDD)

- **Pure unit**: `member-qr` round-trip + reject-foreign; `checkInSchema`;
  `activity-mapper` (UTC datetime round-trip, Invariant A); `roster`
  dedup/build.
- **Repo behavior**: `ActivityRepository`, `CheckInRepository` (mocked firestore,
  existing pattern; deterministic id, serverTimestamp, skip-already-in).
- **jsdom RTL**: `ActivityForm`, `ActivityPicker`, `Roster`, `ManualTapList`.
- **Rules tests**: `activities` matrix (Admin/PM create ok, Member denied, delete
  denied); confirm `checkIns` Scanner-scope unchanged.
- **Not unit-tested**: `QrScanner` camera glue (camera unavailable in jsdom) —
  covered manually + emulator. `QrCode` render smoke test only.
- **Emulator e2e**: create activity → scan/tap member → assert `checkIns` doc →
  assert A2-derived participation + memberPoints.

## Trust boundary

- Admin/PM operate; QR encodes an opaque doc id only (no PII).
- `checkInAt = serverTimestamp()` — client clock untrusted, so the punctuality
  factor is computed from a server time.
- Scanner-role forgery already blocked at the rule (role must be `Attendee`,
  `activityId ∈ scannerEventIds`); `firestore-security-reviewer` re-verifies.
- A3 writes **only** `checkIns` (+ `activities`); never `participations` /
  `memberPoints` (engine-only).

## Deferred (designed-not-out)

- A4 offline queue — `CheckInRepository.create` is the wrap seam.
- Realtime `onSnapshot` roster — v1 = invalidate-after-write.
- Scanner designation UI — needs B1 uid-provisioning + D4 role UI.
- Director/team roles via roster auto-expansion — v1 manual tap = `Attendee`;
  Admin/PM set other roles through the existing trust model.
- Full Activity CRUD (edit/delete/parent pickers via E1/E5 combobox) — D1.
