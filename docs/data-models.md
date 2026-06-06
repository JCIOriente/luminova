# Data Models

All Firestore collections. Used by Backstage frontend and Beacon functions.

## members/{memberId}

```typescript
interface Member {
  id: string                  // auto-generated Firestore ID
  name: string                // min 3 chars
  email: string               // valid email
  phone?: string              // optional
  role: string                // min 3 chars (e.g. "Presidente", "Secretario")
  profession?: string         // optional
  joinDate: Timestamp         // membership start date (required)
  birthdate: Timestamp        // required
  status: 'Activo' | 'Inactivo' | 'Desafiliado'  // membership standing (default 'Activo')
  profilePicture: string | null  // Firebase Storage URL or null (upload deferred — set null on create)
  totalPoints: number         // default: 0 — updated by aggregation
  active: boolean             // default: true — false = soft deleted
  deletedAt: Timestamp | null // null = active, Timestamp = soft deleted
}
```

**`status` vs `active`**: orthogonal. `active`/`deletedAt` are the system soft-delete
flag (a deleted row is hidden from the list). `status` is editable membership
standing — a `Desafiliado` member is **not** deleted and still appears in the list.

**Soft delete**: Never hard-delete members. Set `active: false` and `deletedAt: serverTimestamp()`.

> **Type location:** `@luminova/types` does not exist yet (no `beacon` consumer
> needs a shared `Member`). The `Member` type + `MemberInput` Zod schema live
> locally in `apps/backstage/src/features/members/types/`. Promote to
> `@luminova/types` when a second app (beacon) consumes it. Form input handles
> `joinDate`/`birthdate` as `YYYY-MM-DD` strings; the repository maps them to/from
> Firestore `Timestamp`.

**Queries used**:
- Get active members: `where('active', '==', true)`
- Paginated: `orderBy('name'), limit(10), startAfter(cursor)`

---

## events/{eventId}

```typescript
interface Event {
  id: string
  type: 'Program' | 'Project' | 'Activity' | 'Gala'
  name: string                // required
  description?: string
  scope: 'National' | 'Local' // default: 'Local'
  directorId: string          // member ID — required
  coDirectorIds: string[]     // member IDs
  collaboratorIds: string[]   // member IDs
  participantIds: string[]    // member IDs
  parentId?: string           // only for type='Activity' — references another event
  startDate: Timestamp
  endDate: Timestamp          // must be >= startDate
}
```

**Validation**: `endDate >= startDate` enforced at form level (Zod) and should be checked in functions.

---

## pointRules/{ruleId}

```typescript
interface PointRule {
  id: string
  type: 'Program' | 'Project' | 'Activity' | 'Gala'
  role: 'Director' | 'CoDirector' | 'Collaborator' | 'Participant'
  points: number              // non-negative integer
  description: string         // e.g. "Director de Programa Nacional"
}
```

**Query used in beacon**: `where('type', '==', event.type)` to get all rules for an event type.

**Matrix**: Each `type × role` combination can have one rule. 4 types × 4 roles = 16 possible rules.

---

## allies/{allyId}

```typescript
interface Ally {
  id: string
  companyName: string         // required, min 3 chars
  contactPerson: string       // required, min 3 chars (label "Encargado")
  phone: string               // required
  email: string               // valid email
  active: boolean             // system — soft-delete flag (default true)
  deletedAt: Timestamp | null // system — set on soft-delete (serverTimestamp)
}
```

**Soft-delete**: allies are never hard-deleted. `softDelete` sets `active=false` and
`deletedAt`. List/read queries filter `active==true`. `active`/`deletedAt` are
system-managed — never written by the edit form.

**Query used**: `where('active','==',true)`, sorted client-side by `companyName` (es locale).

---

## memberPoints/{year}/{month}/{eventId}

**Write-protected**: Only Cloud Functions (beacon) write to this collection. Client has read-only access.

```typescript
interface MemberPoints {
  director: string            // memberId
  name: string                // event name (denormalized for display)
  coDirectorIds: string[]
  collaboratorIds: string[]
  participantIds: string[]
  points: Record<string, number>  // memberId → total points for this event
  updatedAt: Timestamp        // serverTimestamp()
}
```

**Path structure**: `memberPoints/{year}/{month}/{eventId}`
- `year`: full year string e.g. `"2025"`
- `month`: zero-padded month e.g. `"01"` through `"12"`
- `eventId`: same as the event document ID

**Example path**: `memberPoints/2025/03/abc123def456`

---

## Firestore Security Rules Summary

```
members       → authenticated read/write
events        → authenticated read/write
pointRules    → authenticated read/write
allies        → authenticated read/write
memberPoints  → authenticated read only (no client writes)
*             → deny all
```

---

## TypeScript Shared Types

Located in `packages/types/src/models.ts`:

```typescript
export type EventType = 'Program' | 'Project' | 'Activity' | 'Gala'
export type EventRole = 'Director' | 'CoDirector' | 'Collaborator' | 'Participant'
export type EventScope = 'National' | 'Local'

export interface Member { ... }
export interface Event { ... }
export interface PointRule { ... }
export interface Ally { ... }
export interface MemberPoints { ... }
```

Zod input schemas live in each feature's `types/` folder in Backstage (not in the shared package).
