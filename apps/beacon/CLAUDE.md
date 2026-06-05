# Beacon — Claude Code Guide

## Purpose

Firebase Cloud Functions backend. Listens to Firestore event writes and automatically calculates member points.

## Function: `awardPoints`

**Trigger**: `onDocumentWritten('/events/{id}')`

**Logic**:
1. Extract event data (type, directorId, coDirectorIds, collaboratorIds, participantIds)
2. If event deleted → remove `memberPoints/{year}/{month}/{eventId}` document
3. If event created/updated:
   - Query `pointRules` collection filtered by `type` = event.type
   - Build role→points map from rules
   - Calculate points per member based on their role
   - Write to `memberPoints/{year}/{month}/{eventId}`

**Output path**: `memberPoints/{year}/{month}/{eventId}` where year/month = event's `startDate`

## Rules

- **Admin SDK only** — never import `firebase/firestore` (client SDK). Use `firebase-admin`.
- **No client-side Firebase** — this is a Node.js functions environment
- Functions runtime: **Node.js 24** (configure in `firebase.json` → `functions.runtime: "nodejs24"` and `engines.node: "24"` in `apps/beacon/package.json`)

## Data Flow

```
Firestore write to /events/{id}
  → awardPoints trigger fires
  → fetch pointRules where type == event.type
  → calculate: Director gets X pts, CoDirector gets Y pts, etc.
  → write aggregated points to /memberPoints/{year}/{month}/{eventId}
```

## Point Calculation

```ts
// For each role, fetch the matching pointRule
// Director: directorId gets Director points
// CoDirectors: each coDirectorId gets CoDirector points
// Collaborators: each collaboratorId gets Collaborator points
// Participants: each participantId gets Participant points
// A member can appear in multiple roles — points are summed
// Result: Record<memberId, totalPoints>
```

## MemberPoints Document Shape

```ts
{
  director: string          // memberId
  name: string              // event name (for display)
  coDirectorIds: string[]
  collaboratorIds: string[]
  participantIds: string[]
  points: Record<string, number>  // memberId → points earned in this event
  updatedAt: FieldValue.serverTimestamp()
}
```

## Helper Functions to Implement

- `extractEventData(data)` — safely parse event document, return null if invalid
- `fetchPointRules(type)` — query pointRules by event type
- `calculatePointsForRoles(event, rules)` — return Record<memberId, points>
- `aggregatePoints(rolePointMaps)` — merge and sum points from all roles
- `getMemberPointsRef(year, month, eventId)` — return Firestore DocumentReference

## Harness

- **Toolchain.** Node 24 runtime (`firebase.json` → `functions.runtime: "nodejs24"`, `engines.node: "24"`). `firebase-admin` + `firebase-functions`. TS 5.7 strict.
- **CI gate.** `beacon-ci` = prettier-check → eslint → tsc → vitest (emulator-backed) → npm audit. Run via `pnpm --filter beacon run ci` (rolled into `pnpm pr-tests`). Use `run ci` — bare `pnpm ci` is pnpm's reinstall builtin.
- **Invariants.** Admin SDK only — **never** import `firebase/firestore` (client SDK). `extractEventData` returns null on invalid input (no unchecked reads). Trigger logic idempotent (re-running on same event yields same `memberPoints` doc).
- **Sensitive surface — server-side trust boundary. ALWAYS `/security-review` + `firebase-functions-reviewer` before "done".** Untrusted Firestore input, points calc integrity, deletion handling.
- **Heaviest skills.** `/security-review`, `secure-dep-vetting` (server deps).
