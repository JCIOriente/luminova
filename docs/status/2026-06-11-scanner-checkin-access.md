# Scanner check-in access after `/check-in` removal

**Date:** 2026-06-11
**Branch:** `feat/activity-detail` (slice 4 of C1-lite initiatives)
**Context:** Slice 4 moved check-in onto the activity detail page and removed the
standalone `/check-in` route + sidebar item (spec
`docs/specs/2026-06-10-initiatives-c1-lite-design.md`, Navigation). Multi-agent
`/code-review` caught that this silently locked the **Scanner** role out of the
product — the spec never addressed how a Scanner reaches the detail page.

## The hole

`Scanner` is a live, provisioned role (beacon `set-user-roles.ts` +
`claims-sync` manage it with `scannerEventIds`). It grants **only**
`checkIn Attendance { eventId ∈ scannerEventIds }` — no `read Activity`, no other
nav. Its only entry point was the `/check-in` nav item. Removing it left the
Scanner with zero reachable check-in surface (the detail route gates on
`read Activity`, which Scanner lacked).

## Fix shipped

Privacy-preserving, no `firestore.rules` change:

- **`packages/auth/src/ability.ts`** — Scanner additionally gets client
  `can("read", "Activity")`. Activities are already `signedIn`-readable in
  `firestore.rules`, so this only opens the backstage UI; it widens no actual
  data access. The **member directory stays closed** (no `read Member`).
- The `/activities` nav item (gated on `read Activity`) now shows for Scanner →
  their entry point. Detail route `canRead` passes → they reach the check-in tab,
  which is event-scoped via `subject("Attendance", { eventId })`.
- **Dead-tab fix:** the Check-in tab is hidden from roles that can't check into
  the activity (previously showed a "Sin acceso" dead tab to ExecutiveCommittee /
  Membership).
- **`ActivityTable`** gained a `canManage` prop; the edit/cancel column is hidden
  from read-only viewers (Scanner) so the admin table reads clean.

## Accepted limitation (follow-up)

Because the member directory stays closed, a Scanner gets **QR-scan-primary**
check-in: the named roster and manual-tap list are empty (they need
`read Member`). The QR path is unaffected — it decodes the member id from the
badge and the `checkIns` create rule validates member existence server-side. A
"Modo escáner: registra asistencia con el lector QR." hint is shown.

If manual tap / named roster for Scanners is wanted later, it requires a
deliberate decision to widen Scanner's member-directory access (the
`firestore.rules` `members` read deliberately excludes Scanner) — out of scope
for this slice. Track as a future A-track (offline/scanner) item.
