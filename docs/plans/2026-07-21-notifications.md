# Push Notifications + In-App Inbox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A manual-compose notification tool — an authorized backstage user writes a message, picks an audience (Everyone / Members / role), and a beacon Firestore trigger fans out an in-app inbox copy per member and best-effort FCM push; spotlight installers get push-only broadcasts.

**Architecture:** Compose = admin-gated `create` of a `notifications/{id}` doc. A `onDocumentCreated("notifications/{id}")` beacon trigger resolves the audience to a member set (inbox fan-out) and a token set (FCM multicast), `retry:false`, best-effort push, inline dead-token prune. Backstage renders a bell inbox from `members/{uid}/notifications`; spotlight only registers tokens and shows push. Authorization is a new `create:Notification` CASL subject.

**Tech Stack:** Firebase Cloud Messaging (web), firebase-admin messaging, CASL, TanStack Query v5, React Hook Form + Zod, vite-plugin-pwa (generateSW), vitest + Firestore emulator.

**Spec:** `docs/specs/2026-07-21-notifications-design.md`

**Worktree:** `.worktrees/notifications` on branch `feat/notifications` (already created).

---

## Manual owner op (do FIRST — blocks end-to-end testing, not code)

- [ ] In the Firebase Console: enable the **Cloud Messaging API** and generate a **Web Push (VAPID) key pair** (Project Settings → Cloud Messaging → Web configuration). Record the public VAPID key. It is consumed as `VITE_FIREBASE_VAPID_KEY` (added to each frontend `.env.local` and to the env docs). Code tasks below do not depend on the real key existing; only live push delivery does.

---

## File Structure

**PR1 — types + auth + rules + beacon** (self-contained; emulator-testable)
- `packages/types/src/permission.ts` (modify) — add `"Notification"` subject.
- `packages/types/src/role-definition.ts` (modify) — grant `create/read:Notification` to ExecutiveCommittee.
- `packages/types/src/notification.ts` (create) — `NotificationDoc`, `Audience`, `InboxDoc` types + Zod schemas + `INBOX_MUTABLE_FIELDS`.
- `packages/types/src/index.ts` (modify) — re-export the above.
- `firestore.rules` (modify) — `notifications`, `members/{uid}/notifications`, `members/{uid}/fcmTokens`, `pushTokens`.
- `tests/firestore-rules/rules.test.ts` (modify) — allow/deny cases.
- `apps/beacon/src/notifications/audience.ts` (create) — pure audience→query descriptor.
- `apps/beacon/src/notifications/audience.test.ts` (create).
- `apps/beacon/src/notifications/send.ts` (create) — resolve members/tokens, fan-out, multicast, prune, stats.
- `apps/beacon/src/notifications/send.emulator.test.ts` (create).
- `apps/beacon/src/index.ts` (modify) — export `onNotificationCreated`.

**PR2 — shared messaging client**
- `packages/firebase/src/messaging.ts` (create) — lazy FCM init, `requestPushToken`, `onForegroundMessage`.
- `packages/firebase/package.json` (modify) — add `./messaging` export.
- `packages/firebase/src/messaging.test.ts` (create).

**PR3 — backstage compose + inbox**
- `apps/backstage/src/features/notifications/repositories/notification-repository.ts` (create).
- `apps/backstage/src/features/notifications/hooks/*` (create) — compose mutation, inbox query, mark-read.
- `apps/backstage/src/features/notifications/components/notifications-page.tsx` (create) — compose form + history.
- `apps/backstage/src/features/notifications/components/notification-bell.tsx` (create) — bell + unread + panel.
- `apps/backstage/src/routes/_app/notificaciones.tsx` (create) — gated route exporting `Route`.
- `apps/backstage/src/lib/push-registration.ts` (create) — soft-prompt + token write/delete.
- `apps/backstage/public/firebase-messaging-sw.js` (create) — background handler.

**PR4 — spotlight prompt**
- `apps/spotlight/src/lib/push-registration.ts` (create) — anon soft prompt + `pushTokens` write.
- `apps/spotlight/public/firebase-messaging-sw.js` (create).
- `apps/spotlight/src/components/push-prompt.tsx` (create).

---

## PR1 — types + auth + rules + beacon

### Task 1: Add the `Notification` CASL subject

**Files:**
- Modify: `packages/types/src/permission.ts:4-17`
- Test: `packages/types/src/permission.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
// packages/types/src/permission.test.ts
import { describe, expect, it } from "vitest";
import { SUBJECTS, isValidPermissionCode } from "./permission.js";

describe("Notification subject", () => {
  it("is a known subject", () => {
    expect(SUBJECTS).toContain("Notification");
  });
  it("accepts create:Notification and read:Notification", () => {
    expect(isValidPermissionCode("create:Notification")).toBe(true);
    expect(isValidPermissionCode("read:Notification")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/types test -- permission`
Expected: FAIL — `SUBJECTS` does not contain `"Notification"`.

- [ ] **Step 3: Add the subject**

In `packages/types/src/permission.ts`, add `"Notification"` to the `SUBJECTS` array (before `"all"`):

```ts
export const SUBJECTS = [
  "Member",
  "Ally",
  "PointRule",
  "MemberPoints",
  "Attendance",
  "Program",
  "Project",
  "Activity",
  "Position",
  "Role",
  "Lead",
  "Notification",
  "all",
] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/types test -- permission`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/permission.ts packages/types/src/permission.test.ts
git commit -m "feat(types): add Notification permission subject"
```

### Task 2: Seed `create/read:Notification` to ExecutiveCommittee

**Files:**
- Modify: `packages/types/src/role-definition.ts:40-47`
- Test: `packages/types/src/role-definition.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
// packages/types/src/role-definition.test.ts
import { describe, expect, it } from "vitest";
import { BUILT_IN_ROLE_PERMS } from "./role-definition.js";

describe("ExecutiveCommittee notification grant", () => {
  it("can create and read notifications", () => {
    expect(BUILT_IN_ROLE_PERMS.ExecutiveCommittee).toContain("create:Notification");
    expect(BUILT_IN_ROLE_PERMS.ExecutiveCommittee).toContain("read:Notification");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/types test -- role-definition`
Expected: FAIL — array lacks the codes.

- [ ] **Step 3: Add the grants**

In `packages/types/src/role-definition.ts`, append to the `ExecutiveCommittee` array:

```ts
  ExecutiveCommittee: [
    "read:Member",
    "read:Ally",
    "read:MemberPoints",
    "read:Program",
    "read:Project",
    "manage:Position",
    "create:Notification",
    "read:Notification",
  ],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/types test -- role-definition`
Expected: PASS.

Note: built-in role docs are seeded once then admin-owned (see `seedBuiltInRoles` — `create()` never clobbers). Existing deployments need `recomputeAllClaims` / a re-seed of the ExecutiveCommittee role doc's `permissions` for the grant to reach live claims. Note this in the PR body.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/role-definition.ts packages/types/src/role-definition.test.ts
git commit -m "feat(types): grant ExecutiveCommittee create/read:Notification"
```

### Task 3: Notification domain types + Zod schemas

**Files:**
- Create: `packages/types/src/notification.ts`
- Modify: `packages/types/src/index.ts`
- Test: `packages/types/src/notification.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/types/src/notification.test.ts
import { describe, expect, it } from "vitest";
import { audienceSchema, notificationCreateSchema, INBOX_MUTABLE_FIELDS } from "./notification.js";

describe("audienceSchema", () => {
  it("accepts everyone and members without roleId", () => {
    expect(audienceSchema.parse({ type: "everyone" })).toEqual({ type: "everyone" });
    expect(audienceSchema.parse({ type: "members" })).toEqual({ type: "members" });
  });
  it("requires roleId for role audience", () => {
    expect(() => audienceSchema.parse({ type: "role" })).toThrow();
    expect(audienceSchema.parse({ type: "role", roleId: "ExecutiveCommittee" }))
      .toEqual({ type: "role", roleId: "ExecutiveCommittee" });
  });
});

describe("notificationCreateSchema", () => {
  it("rejects an empty title", () => {
    expect(() => notificationCreateSchema.parse({ title: "", body: "x", url: null, audience: { type: "everyone" } })).toThrow();
  });
  it("accepts a well-formed compose payload", () => {
    const v = notificationCreateSchema.parse({
      title: "Reunión", body: "Sábado 10am", url: null, audience: { type: "members" },
    });
    expect(v.title).toBe("Reunión");
  });
});

describe("INBOX_MUTABLE_FIELDS", () => {
  it("locks everything except read", () => {
    expect(INBOX_MUTABLE_FIELDS).toEqual(["read"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/types test -- notification`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the types + schemas**

```ts
// packages/types/src/notification.ts
import { z } from "zod";
import type { Timestamp } from "firebase/firestore";

export const audienceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("everyone") }),
  z.object({ type: z.literal("members") }),
  z.object({ type: z.literal("role"), roleId: z.string().min(1) }),
]);
export type Audience = z.infer<typeof audienceSchema>;

export const notificationCreateSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  url: z.string().url().nullable(),
  audience: audienceSchema,
});
export type NotificationCreate = z.infer<typeof notificationCreateSchema>;

export interface NotificationStats {
  pushSent: number;
  pushFailed: number;
}

export interface NotificationDoc extends NotificationCreate {
  id: string;
  createdBy: string;
  createdAt: Timestamp;
  stats: NotificationStats | null;
}

export interface InboxDoc {
  id: string;
  title: string;
  body: string;
  url: string | null;
  read: boolean;
  createdAt: Timestamp;
}

/** The only field a member may mutate on their own inbox copy. Mirrored in
 *  firestore.rules; a rules test cross-checks the two stay in lockstep. */
export const INBOX_MUTABLE_FIELDS = ["read"] as const;
```

- [ ] **Step 4: Re-export from the package index**

In `packages/types/src/index.ts`, add exports alongside the existing ones:

```ts
export {
  audienceSchema,
  notificationCreateSchema,
  INBOX_MUTABLE_FIELDS,
} from "./notification.js";
export type {
  Audience,
  NotificationCreate,
  NotificationStats,
  NotificationDoc,
  InboxDoc,
} from "./notification.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @luminova/types test -- notification`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/notification.ts packages/types/src/notification.test.ts packages/types/src/index.ts
git commit -m "feat(types): notification + inbox schemas and audience union"
```

### Task 4: Firestore rules for the four collections

**Files:**
- Modify: `firestore.rules` (add four match blocks before the final `match /{document=**}`)

- [ ] **Step 1: Add the rules**

Insert before the terminal `match /{document=**}` block. `canDo` and `signedIn` already exist.

```
    // Composed notifications: only a create:Notification holder may compose; the
    // create is the send trigger's input. stats is Admin-SDK-written (bypasses
    // rules), so it must be absent on the client create. No client update/delete.
    match /notifications/{id} {
      allow read: if canDo('read', 'Notification');
      allow create: if canDo('create', 'Notification')
        && request.resource.data.createdBy == request.auth.uid
        && request.resource.data.createdAt == request.time
        && !('stats' in request.resource.data)
        && request.resource.data.audience.type in ['everyone', 'members', 'role'];
      allow update, delete: if false;
    }

    // Per-member inbox fan-out. Admin-SDK writes the copies; the owner may read
    // and may flip ONLY `read`. INBOX_MUTABLE_FIELDS in @luminova/types mirrors
    // this hasOnly(['read']) — kept in lockstep by a rules cross-check test.
    match /members/{memberId}/notifications/{id} {
      allow read: if signedIn() && request.auth.uid == memberId;
      allow update: if signedIn() && request.auth.uid == memberId
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
      allow create, delete: if false;
    }

    // A member's FCM device tokens. Owner-only; token id is the token string.
    match /members/{memberId}/fcmTokens/{token} {
      allow read, create, delete: if signedIn() && request.auth.uid == memberId;
      allow update: if false;
    }

    // Anonymous spotlight device tokens. Public create with a bounded shape (no
    // PII), self-delete by the same anon device. No read/list. Mirrors `leads`.
    match /pushTokens/{token} {
      allow create: if request.resource.data.keys().hasOnly(['createdAt'])
        && request.resource.data.createdAt == request.time;
      allow delete: if true;
      allow read, update: if false;
    }
```

- [ ] **Step 2: Deploy rules to the emulator and eyeball compile**

Run: `firebase emulators:exec --only firestore "true"`
Expected: rules compile with no syntax error (command exits 0).

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): notifications, inbox, fcmTokens, pushTokens"
```

### Task 5: Rules tests (allow/deny + inbox lock cross-check)

**Files:**
- Modify: `tests/firestore-rules/rules.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a `describe` block. Follow the file's existing auth-context + `assertFails`/`assertSucceeds` helpers (mirror the nearest existing block for imports and the authed-context factory).

```ts
describe("notifications", () => {
  it("a create:Notification holder may compose", async () => {
    const db = authedContext({ uid: "exec", perms: ["create:Notification"] });
    await assertSucceeds(db.doc("notifications/n1").set({
      title: "t", body: "b", url: null,
      audience: { type: "everyone" },
      createdBy: "exec", createdAt: serverTimestamp(),
    }));
  });
  it("a member without the perm may not compose", async () => {
    const db = authedContext({ uid: "m1", perms: [] });
    await assertFails(db.doc("notifications/n2").set({
      title: "t", body: "b", url: null,
      audience: { type: "everyone" },
      createdBy: "m1", createdAt: serverTimestamp(),
    }));
  });
  it("rejects a create that pre-sets stats", async () => {
    const db = authedContext({ uid: "exec", perms: ["create:Notification"] });
    await assertFails(db.doc("notifications/n3").set({
      title: "t", body: "b", url: null, audience: { type: "everyone" },
      createdBy: "exec", createdAt: serverTimestamp(), stats: { pushSent: 0, pushFailed: 0 },
    }));
  });
});

describe("member inbox", () => {
  it("owner reads and marks read; cannot edit other fields", async () => {
    await withAdmin((admin) => admin.doc("members/m1/notifications/n1").set({
      title: "t", body: "b", url: null, read: false, createdAt: Timestamp.now(),
    }));
    const db = authedContext({ uid: "m1" });
    await assertSucceeds(db.doc("members/m1/notifications/n1").get());
    await assertSucceeds(db.doc("members/m1/notifications/n1").update({ read: true }));
    await assertFails(db.doc("members/m1/notifications/n1").update({ title: "hax" }));
  });
  it("a non-owner cannot read another member's inbox", async () => {
    await withAdmin((admin) => admin.doc("members/m1/notifications/n1").set({
      title: "t", body: "b", url: null, read: false, createdAt: Timestamp.now(),
    }));
    const db = authedContext({ uid: "m2" });
    await assertFails(db.doc("members/m1/notifications/n1").get());
  });
});

describe("pushTokens", () => {
  it("anon may create a bounded token doc and delete it", async () => {
    const db = anonContext();
    await assertSucceeds(db.doc("pushTokens/tok1").set({ createdAt: serverTimestamp() }));
    await assertSucceeds(db.doc("pushTokens/tok1").delete());
  });
  it("rejects an extra field (PII smuggling)", async () => {
    const db = anonContext();
    await assertFails(db.doc("pushTokens/tok2").set({ createdAt: serverTimestamp(), email: "x@y.z" }));
  });
});
```

Add a cross-check test guarding the rules↔types inbox lock (mirror the existing `activity-locked-fields.rules.test.ts` regex-parse approach — the rules-test package cannot import `@luminova/types`, so read `INBOX_MUTABLE_FIELDS` from source text):

```ts
it("firestore.rules inbox hasOnly matches INBOX_MUTABLE_FIELDS", () => {
  const rules = readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8");
  const m = rules.match(/members\/\{memberId\}\/notifications[\s\S]*?hasOnly\(\[([^\]]*)\]\)/);
  const rulesFields = m![1].split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
  expect(rulesFields).toEqual(["read"]); // must equal INBOX_MUTABLE_FIELDS
});
```

- [ ] **Step 2: Run tests to verify they fail (before rules) / pass (after Task 4)**

Run: `pnpm --filter @luminova/firestore-rules test` (or the repo's rules-test script — see `tests/firestore-rules/package.json`).
Expected: the new cases pass against the Task 4 rules; if any deny-case passes-through, fix the rule.

- [ ] **Step 3: Commit**

```bash
git add tests/firestore-rules/rules.test.ts
git commit -m "test(rules): notifications, inbox lock, pushTokens shape"
```

### Task 6: Pure audience → query descriptor

**Files:**
- Create: `apps/beacon/src/notifications/audience.ts`
- Test: `apps/beacon/src/notifications/audience.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/beacon/src/notifications/audience.test.ts
import { describe, expect, it } from "vitest";
import { parseAudience, memberQueryFilter } from "./audience.js";

describe("parseAudience", () => {
  it("returns null on a malformed audience", () => {
    expect(parseAudience({ type: "bogus" })).toBeNull();
    expect(parseAudience({ type: "role" })).toBeNull(); // missing roleId
    expect(parseAudience(undefined)).toBeNull();
  });
  it("parses each valid shape", () => {
    expect(parseAudience({ type: "everyone" })).toEqual({ type: "everyone" });
    expect(parseAudience({ type: "role", roleId: "r1" })).toEqual({ type: "role", roleId: "r1" });
  });
});

describe("memberQueryFilter", () => {
  it("no role filter for everyone/members", () => {
    expect(memberQueryFilter({ type: "everyone" })).toBeNull();
    expect(memberQueryFilter({ type: "members" })).toBeNull();
  });
  it("array-contains roleId for a role audience", () => {
    expect(memberQueryFilter({ type: "role", roleId: "r1" }))
      .toEqual({ field: "roleIds", op: "array-contains", value: "r1" });
  });
});

describe("includesAnonTokens", () => {
  it("only everyone reaches anonymous pushTokens", async () => {
    const { includesAnonTokens } = await import("./audience.js");
    expect(includesAnonTokens({ type: "everyone" })).toBe(true);
    expect(includesAnonTokens({ type: "members" })).toBe(false);
    expect(includesAnonTokens({ type: "role", roleId: "r1" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter beacon test -- audience`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/beacon/src/notifications/audience.ts
export type Audience =
  | { type: "everyone" }
  | { type: "members" }
  | { type: "role"; roleId: string };

export function parseAudience(raw: unknown): Audience | null {
  if (typeof raw !== "object" || raw === null) return null;
  const a = raw as Record<string, unknown>;
  if (a.type === "everyone" || a.type === "members") return { type: a.type };
  if (a.type === "role" && typeof a.roleId === "string" && a.roleId.length > 0) {
    return { type: "role", roleId: a.roleId };
  }
  return null;
}

export function memberQueryFilter(
  a: Audience,
): { field: "roleIds"; op: "array-contains"; value: string } | null {
  return a.type === "role" ? { field: "roleIds", op: "array-contains", value: a.roleId } : null;
}

export function includesAnonTokens(a: Audience): boolean {
  return a.type === "everyone";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter beacon test -- audience`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/notifications/audience.ts apps/beacon/src/notifications/audience.test.ts
git commit -m "feat(beacon): pure audience parse + member-query descriptor"
```

### Task 7: Send module — resolve, fan-out, multicast, prune, stats

**Files:**
- Create: `apps/beacon/src/notifications/send.ts`
- Test: `apps/beacon/src/notifications/send.emulator.test.ts`

Design notes for the implementer:
- Reuse `chunk` from `apps/beacon/src/chunk.ts` (300 for reads, 500 for the FCM multicast cap).
- Inbox doc id = the parent notification id (deterministic → retry overwrites, no dupes).
- Push is best-effort: wrap `sendEachForMulticast` per batch; never throw out of the top-level (the trigger is `retry:false`).
- Prune: on a per-token response with `error.code` in `messaging/registration-token-not-registered` or `messaging/invalid-argument`, delete that token's doc.
- Inject the messaging sender so the emulator test can stub it (FCM has no emulator).

- [ ] **Step 1: Write the failing emulator test**

```ts
// apps/beacon/src/notifications/send.emulator.test.ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import { clearCollections, initEmulatorTestApp } from "../award-points/emulator-harness.js";
import { sendNotification } from "./send.js";

const { app, db } = initEmulatorTestApp();

beforeEach(async () => {
  await clearCollections(db, ["members", "pushTokens", "notifications"]);
});
afterAll(async () => {
  await deleteApp(app);
});

function member(id: string, roleIds: string[], uid = id) {
  return db.doc(`members/${id}`).set({ uid, roleIds, name: id, totalPoints: 0 });
}

describe("sendNotification (emulator)", () => {
  it("fans out an inbox copy to every matching member", async () => {
    await member("m1", ["ExecutiveCommittee"]);
    await member("m2", []);
    const sender = { sendEachForMulticast: vi.fn().mockResolvedValue({ responses: [] }) };

    await sendNotification(db, sender, "n1", {
      title: "t", body: "b", url: null, audience: { type: "members" }, createdBy: "x",
      createdAt: Timestamp.now(),
    });

    expect((await db.doc("members/m1/notifications/n1").get()).data()?.read).toBe(false);
    expect((await db.doc("members/m2/notifications/n1").get()).exists).toBe(true);
  });

  it("role audience fans out only to holders", async () => {
    await member("m1", ["ExecutiveCommittee"]);
    await member("m2", ["Member"]);
    const sender = { sendEachForMulticast: vi.fn().mockResolvedValue({ responses: [] }) };

    await sendNotification(db, sender, "n2", {
      title: "t", body: "b", url: null,
      audience: { type: "role", roleId: "ExecutiveCommittee" }, createdBy: "x",
      createdAt: Timestamp.now(),
    });

    expect((await db.doc("members/m1/notifications/n2").get()).exists).toBe(true);
    expect((await db.doc("members/m2/notifications/n2").get()).exists).toBe(false);
  });

  it("is idempotent — a re-send overwrites, never duplicates", async () => {
    await member("m1", []);
    const sender = { sendEachForMulticast: vi.fn().mockResolvedValue({ responses: [] }) };
    const doc = {
      title: "t", body: "b", url: null, audience: { type: "members" as const },
      createdBy: "x", createdAt: Timestamp.now(),
    };
    await sendNotification(db, sender, "n3", doc);
    await sendNotification(db, sender, "n3", doc);
    const snap = await db.collection("members/m1/notifications").get();
    expect(snap.size).toBe(1);
  });

  it("everyone also collects anon pushTokens and prunes dead ones", async () => {
    await member("m1", []);
    await db.doc("members/m1/fcmTokens/tokA").set({ createdAt: Timestamp.now() });
    await db.doc("pushTokens/tokB").set({ createdAt: Timestamp.now() });
    const sender = {
      sendEachForMulticast: vi.fn().mockResolvedValue({
        responses: [
          { success: true },
          { success: false, error: { code: "messaging/registration-token-not-registered" } },
        ],
      }),
    };

    await sendNotification(db, sender, "n4", {
      title: "t", body: "b", url: null, audience: { type: "everyone" }, createdBy: "x",
      createdAt: Timestamp.now(),
    });

    const call = sender.sendEachForMulticast.mock.calls[0][0];
    expect(new Set(call.tokens)).toEqual(new Set(["tokA", "tokB"]));
    // one token was dead → pruned; the surviving token's collection still has one
    const remaining =
      (await db.collection("members/m1/fcmTokens").get()).size +
      (await db.collection("pushTokens").get()).size;
    expect(remaining).toBe(1);
    expect((await db.doc("notifications/n4").get()).data()?.stats)
      .toEqual({ pushSent: 1, pushFailed: 1 });
  });

  it("malformed audience is a no-op (no throw, no writes)", async () => {
    await member("m1", []);
    const sender = { sendEachForMulticast: vi.fn() };
    await sendNotification(db, sender, "n5", {
      title: "t", body: "b", url: null, audience: { type: "bogus" }, createdBy: "x",
      createdAt: Timestamp.now(),
    } as never);
    expect(sender.sendEachForMulticast).not.toHaveBeenCalled();
    expect((await db.collection("members/m1/notifications").get()).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter beacon test:emulator -- send`
Expected: FAIL — `send.js` not found.

- [ ] **Step 3: Implement the send module**

```ts
// apps/beacon/src/notifications/send.ts
import { type Firestore, type DocumentReference } from "firebase-admin/firestore";
import { chunk } from "../chunk.js";
import { parseAudience, memberQueryFilter, includesAnonTokens, type Audience } from "./audience.js";

const READ_CHUNK = 300;
const MULTICAST_CAP = 500;
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

export interface MulticastSender {
  sendEachForMulticast(message: {
    tokens: string[];
    notification: { title: string; body: string };
    data?: Record<string, string>;
  }): Promise<{ responses: { success: boolean; error?: { code?: string } }[] }>;
}

export interface NotificationInput {
  title: string;
  body: string;
  url: string | null;
  audience: unknown;
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
}

interface TokenRef {
  token: string;
  ref: DocumentReference;
}

async function resolveMembers(db: Firestore, audience: Audience): Promise<string[]> {
  const filter = memberQueryFilter(audience);
  let query: FirebaseFirestore.Query = db.collection("members").select("uid");
  if (filter) query = query.where(filter.field, filter.op, filter.value);
  const snap = await query.get();
  return snap.docs.map((d) => d.id);
}

async function memberTokens(db: Firestore, memberIds: string[]): Promise<TokenRef[]> {
  const out: TokenRef[] = [];
  for (const batch of chunk(memberIds, READ_CHUNK)) {
    const snaps = await Promise.all(
      batch.map((id) => db.collection(`members/${id}/fcmTokens`).get()),
    );
    for (const snap of snaps) for (const d of snap.docs) out.push({ token: d.id, ref: d.ref });
  }
  return out;
}

async function anonTokens(db: Firestore): Promise<TokenRef[]> {
  const snap = await db.collection("pushTokens").get();
  return snap.docs.map((d) => ({ token: d.id, ref: d.ref }));
}

async function fanOutInbox(
  db: Firestore,
  memberIds: string[],
  id: string,
  input: NotificationInput,
): Promise<void> {
  for (const batch of chunk(memberIds, MULTICAST_CAP)) {
    const writer = db.batch();
    for (const memberId of batch) {
      writer.set(db.doc(`members/${memberId}/notifications/${id}`), {
        title: input.title,
        body: input.body,
        url: input.url,
        read: false,
        createdAt: input.createdAt,
      });
    }
    await writer.commit();
  }
}

async function pushAndPrune(
  sender: MulticastSender,
  tokens: TokenRef[],
  input: NotificationInput,
): Promise<{ pushSent: number; pushFailed: number }> {
  let pushSent = 0;
  let pushFailed = 0;
  for (const batch of chunk(tokens, MULTICAST_CAP)) {
    try {
      const res = await sender.sendEachForMulticast({
        tokens: batch.map((t) => t.token),
        notification: { title: input.title, body: input.body },
        data: input.url ? { url: input.url } : undefined,
      });
      await Promise.all(
        res.responses.map(async (r, i) => {
          if (r.success) {
            pushSent += 1;
            return;
          }
          pushFailed += 1;
          if (r.error?.code && DEAD_TOKEN_CODES.has(r.error.code)) {
            await batch[i].ref.delete().catch(() => undefined);
          }
        }),
      );
    } catch (err) {
      // Best-effort: a whole-batch failure counts as failed, never throws
      // (trigger is retry:false — a throw would redeliver and re-push).
      console.error("notification push batch failed", err);
      pushFailed += batch.length;
    }
  }
  return { pushSent, pushFailed };
}

/** Fan out one composed notification: inbox copies to matching members + a
 *  best-effort FCM multicast, then write stats back. Never throws on push. */
export async function sendNotification(
  db: Firestore,
  sender: MulticastSender,
  id: string,
  input: NotificationInput,
): Promise<void> {
  const audience = parseAudience(input.audience);
  if (audience === null) {
    console.error("notification has malformed audience — skipping", { id });
    return;
  }
  const memberIds = await resolveMembers(db, audience);
  await fanOutInbox(db, memberIds, id, input);

  const tokens = await memberTokens(db, memberIds);
  if (includesAnonTokens(audience)) tokens.push(...(await anonTokens(db)));

  const stats =
    tokens.length > 0 ? await pushAndPrune(sender, tokens, input) : { pushSent: 0, pushFailed: 0 };
  await db.doc(`notifications/${id}`).set({ stats }, { merge: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter beacon test:emulator -- send`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/notifications/send.ts apps/beacon/src/notifications/send.emulator.test.ts
git commit -m "feat(beacon): notification fan-out + best-effort FCM multicast + prune"
```

### Task 8: Wire the trigger into the functions entry

**Files:**
- Modify: `apps/beacon/src/index.ts`

- [ ] **Step 1: Add the trigger export**

At the top, add imports:

```ts
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { sendNotification } from "./notifications/send.js";
```

Add the trigger (near the other exports). `retry:false` is the default for `onDocumentCreated`, stated explicitly for intent:

```ts
// Compose = create of notifications/{id}. Fan out inbox copies + best-effort FCM.
// retry:false — push is not idempotent (a redeliver would double-notify); the send
// module swallows push failures so a transient FCM error never throws a retry.
// The inbox fan-out is idempotent (deterministic doc id) if a redelivery ever occurs.
export const onNotificationCreated = onDocumentCreated(
  { document: "notifications/{id}", retry: false },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const messaging = getMessaging();
    await sendNotification(db(), messaging, event.params.id, {
      title: String(data.title ?? ""),
      body: String(data.body ?? ""),
      url: (data.url as string | null) ?? null,
      audience: data.audience,
      createdBy: String(data.createdBy ?? ""),
      createdAt: data.createdAt,
    });
  },
);
```

- [ ] **Step 2: Typecheck the functions build**

Run: `pnpm --filter beacon typecheck`
Expected: PASS (`getMessaging().sendEachForMulticast` satisfies `MulticastSender`).

- [ ] **Step 3: Dispatch the functions reviewer**

Dispatch `firebase-functions-reviewer` on the `apps/beacon` diff. Address Critical/High findings before proceeding.

- [ ] **Step 4: Commit**

```bash
git add apps/beacon/src/index.ts
git commit -m "feat(beacon): onNotificationCreated trigger"
```

### PR1 close-out

- [ ] Run `pnpm --filter @luminova/types test`, `pnpm --filter beacon test`, `pnpm --filter beacon test:emulator`, the rules test suite — all green.
- [ ] Dispatch `firestore-security-reviewer` (rules + new public-write collection) and `firebase-functions-reviewer`.
- [ ] Run `.claude/hooks/route.sh`; run every mandated review; stamp the trailer.
- [ ] `/security-review` on the branch (auth + rules + functions — mandatory per CLAUDE.md).
- [ ] Open PR 1. Body notes the ExecutiveCommittee re-seed / `recomputeAllClaims` step for existing deployments.

---

## PR2 — shared messaging client (`@luminova/firebase/messaging`)

### Task 9: Lazy FCM client entry

**Files:**
- Create: `packages/firebase/src/messaging.ts`
- Modify: `packages/firebase/package.json` (exports)
- Test: `packages/firebase/src/messaging.test.ts`

- [ ] **Step 1: Add the export map entry**

In `packages/firebase/package.json` `exports`, add:

```json
    "./messaging": "./src/messaging.ts"
```

- [ ] **Step 2: Write the failing test**

The value here is `isPushSupported` (guards Safari/iOS and SSR). Mock `firebase/messaging`'s `isSupported`.

```ts
// packages/firebase/src/messaging.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/messaging", () => ({
  isSupported: vi.fn().mockResolvedValue(false),
  getMessaging: vi.fn(),
  getToken: vi.fn(),
  onMessage: vi.fn(),
}));

describe("isPushSupported", () => {
  it("is false when the browser lacks FCM support", async () => {
    const { isPushSupported } = await import("./messaging.js");
    expect(await isPushSupported()).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @luminova/firebase test -- messaging`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Uses the existing shared app from `app-core.ts` (check its exact export name — this repo initialises the client app there; match it). Init App Check first if present (mirrors `firestore-lite.ts`).

```ts
// packages/firebase/src/messaging.ts
import { getApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
} from "firebase/messaging";

export async function isPushSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  return isSupported().catch(() => false);
}

/** Request a device token. Returns null if unsupported or permission denied.
 *  `swReg` is the app-registered firebase-messaging-sw.js registration. */
export async function requestPushToken(
  vapidKey: string,
  swReg: ServiceWorkerRegistration,
): Promise<string | null> {
  if (!(await isPushSupported())) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const messaging = getMessaging(getApp());
  return getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg }).catch(() => null);
}

export function onForegroundMessage(handler: (payload: MessagePayload) => void): () => void {
  const messaging = getMessaging(getApp());
  return onMessage(messaging, handler);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @luminova/firebase test -- messaging`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/firebase/src/messaging.ts packages/firebase/src/messaging.test.ts packages/firebase/package.json
git commit -m "feat(firebase): lazy @luminova/firebase/messaging client"
```

### PR2 close-out

- [ ] `pnpm --filter @luminova/firebase ci` green.
- [ ] Route + stamp + open PR 2 (stacked on PR 1).

---

## PR3 — backstage compose + inbox

> Scaffold the feature folder with the `backstage-feature-scaffold` skill (repository + TanStack Query + RHF + Zod), then fill in the specifics below. Every data view uses the 3-query-state pattern (loading / error / empty) per the repo guardrail.

### Task 10: Notification repository

**Files:**
- Create: `apps/backstage/src/features/notifications/repositories/notification-repository.ts`
- Test: sibling `.test.ts`

- [ ] **Step 1: Write the failing test** — assert `compose()` writes a doc with `createdBy`, `createdAt: serverTimestamp()`, and no `stats`; `listSent()` maps docs to `NotificationDoc`; `inbox(uid)` reads `members/{uid}/notifications` ordered by `createdAt desc`; `markRead(uid, id)` updates only `read`.

- [ ] **Step 2: Run — FAIL.** `pnpm --filter backstage test -- notification-repository`

- [ ] **Step 3: Implement** the repository against `@luminova/firebase/db`, importing `NotificationCreate`, `NotificationDoc`, `InboxDoc` from `@luminova/types`. `compose(create, uid)` → `addDoc(collection(db,"notifications"), { ...create, createdBy: uid, createdAt: serverTimestamp() })`. `markRead` → `updateDoc(doc(db,`members/${uid}/notifications/${id}`), { read: true })`.

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Commit** — `feat(backstage): notification repository`.

### Task 11: Compose route + form + sent history

**Files:**
- Create: `apps/backstage/src/features/notifications/components/notifications-page.tsx`
- Create: `apps/backstage/src/features/notifications/hooks/use-compose-notification.ts`
- Create: `apps/backstage/src/routes/_app/notificaciones.tsx`

- [ ] **Step 1:** Route file exports only `Route`, gated on `useCan("create","Notification")` (mirror an existing gated route under `_app`, e.g. how `leads`/prospectos gates; render a not-authorized state otherwise). The page component lives in `features/notifications/components` (route-page extract pattern).

- [ ] **Step 2:** Form (RHF + `zodResolver(notificationCreateSchema)`): title, body, url (optional), audience picker. Audience picker options: Everyone, Members, then one entry per role from a `roles` query (`type:"role", roleId`). Submit → `useComposeNotification` mutation → repository `compose`; on success toast "Notificación enviada" and reset.

- [ ] **Step 3:** Sent-history table below (gated on `read:Notification` via `useCan`): `listSent()` query, columns title/audience/createdAt/`stats.pushSent`. 3-query-state.

- [ ] **Step 4:** Add a nav entry + register the route in the role-gate/nav config (mirror how existing `_app` pages register; the nav-config test will require it).

- [ ] **Step 5:** Test the page: renders form, submit calls mutation, non-`read:Notification` user sees no history table. `pnpm --filter backstage test -- notifications-page`.

- [ ] **Step 6:** Commit — `feat(backstage): /notificaciones compose + sent history`.

### Task 12: Inbox bell

**Files:**
- Create: `apps/backstage/src/features/notifications/components/notification-bell.tsx`
- Create: `apps/backstage/src/features/notifications/hooks/use-inbox.ts`
- Modify: app chrome (header) to mount the bell.

- [ ] **Step 1:** `useInbox()` — TanStack Query over `inbox(uid)`; unread = count of `read:false`. `useMarkRead()` mutation invalidates the inbox key.

- [ ] **Step 2:** Bell button + unread badge; panel lists recent (title/body/relative time); click → `markRead` then navigate `url` if present. 3-query-state inside the panel.

- [ ] **Step 3:** Test: badge shows unread count; clicking an item marks read + navigates. `pnpm --filter backstage test -- notification-bell`.

- [ ] **Step 4:** Commit — `feat(backstage): inbox bell + unread badge`.

### Task 13: Push permission prompt + token lifecycle

**Files:**
- Create: `apps/backstage/src/lib/push-registration.ts`
- Create: `apps/backstage/public/firebase-messaging-sw.js`
- Modify: post-login shell to mount the soft prompt; logout to delete the token.

- [ ] **Step 1: Background SW.** `apps/backstage/public/firebase-messaging-sw.js` — self-registered, workbox untouched. Uses `importScripts` of the Firebase compat messaging SW build and `firebase.messaging()` background handler that shows the notification and stores `data.url` for click-through (`notificationclick` → `clients.openWindow(url)`). Config values are the public web config (safe to inline). Do NOT precache anything here.

```js
// apps/backstage/public/firebase-messaging-sw.js
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");
firebase.initializeApp({
  // public web config — same values as VITE_FIREBASE_* (safe to expose)
  apiKey: "…", authDomain: "…", projectId: "…",
  messagingSenderId: "…", appId: "…",
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  self.registration.showNotification(title ?? "JCI Oriente", {
    body: body ?? "",
    data: { url: payload.data?.url ?? "/" },
  });
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url ?? "/"));
});
```

> Spike gate (per spec): confirm the standalone `firebase-messaging-sw.js` coexists with the workbox generateSW registration. If the two registrations conflict in testing, fall back to `importScripts`-ing the FCM compat build into the workbox SW via a vite-plugin-pwa `injectManifest` migration — but only if the standalone SW fails. Record the outcome in the PR body.

- [ ] **Step 2: Registration helper.** `registerPush(uid)` — `navigator.serviceWorker.register("/firebase-messaging-sw.js")`, then `requestPushToken(import.meta.env.VITE_FIREBASE_VAPID_KEY, reg)`; on a token, `setDoc(doc(db,`members/${uid}/fcmTokens/${token}`), { createdAt: serverTimestamp() })`. `unregisterPush(uid, token)` deletes that doc. Wire `onForegroundMessage` → `@luminova/ui` toast.

- [ ] **Step 3: Soft prompt.** A dismissible in-app card ("Activa notificaciones") shown post-login when `Notification.permission === "default"`; accept → `registerPush`. Never call `requestPermission` cold.

- [ ] **Step 4:** Delete the token on logout.

- [ ] **Step 5:** Test the helper (mock `@luminova/firebase/messaging` + db) — token granted writes the doc; denied writes nothing. `pnpm --filter backstage test -- push-registration`.

- [ ] **Step 6:** Add `VITE_FIREBASE_VAPID_KEY=` to `.env.local` template + CLAUDE.md env list.

- [ ] **Step 7:** Commit — `feat(backstage): push permission prompt + token lifecycle + SW`.

### PR3 close-out

- [ ] `pnpm --filter backstage ci`; `react-best-practices` (auto on `.tsx`); dispatch `bundle-budget-watcher` (note the new lazy messaging chunk gz delta).
- [ ] `firestore-security-reviewer` (auth-guarded route + repository).
- [ ] Route + stamp + `/security-review` + open PR 3 (stacked on PR 2).

---

## PR4 — spotlight push prompt (push-only)

### Task 14: Anon token registration + soft prompt + SW

**Files:**
- Create: `apps/spotlight/public/firebase-messaging-sw.js` (same shape as Task 13 Step 1, spotlight web config).
- Create: `apps/spotlight/src/lib/push-registration.ts`
- Create: `apps/spotlight/src/components/push-prompt.tsx`

- [ ] **Step 1:** SW identical in shape to backstage's (spotlight public config). Push-only; no inbox.

- [ ] **Step 2:** `registerPush()` (no uid) — register SW, `requestPushToken(VAPID, reg)`, on token `setDoc(doc(getFirestoreLite()…, "pushTokens", token), { createdAt: serverTimestamp() })`. Spotlight uses firestore-lite; confirm `setDoc` is available on the lite build (it is in firebase 12 `firebase/firestore/lite`). If a write helper doesn't exist yet in spotlight, add a minimal one next to the existing lite reader.

- [ ] **Step 3:** `push-prompt.tsx` — small dismissible prompt. **iOS gate:** render only when `window.matchMedia("(display-mode: standalone)").matches` on iOS (`navigator.standalone` fallback), else return null (web push no-ops on non-installed iOS). Accept → `registerPush()`.

- [ ] **Step 4:** Mount the prompt in the spotlight shell. Test the iOS/standalone gate + token write. `pnpm --filter spotlight test -- push`.

- [ ] **Step 5:** Add `VITE_FIREBASE_VAPID_KEY=` to spotlight `.env.local` template.

- [ ] **Step 6:** Commit — `feat(spotlight): push-permission prompt (installed-PWA gated)`.

### PR4 close-out

- [ ] `pnpm --filter spotlight ci`; `bundle-budget-watcher` (spotlight eager-budget is tight — the messaging chunk MUST stay lazy; verify the `index` chunk gz delta is ~0).
- [ ] Route + stamp + open PR 4 (stacked on PR 3).

---

## Cross-cutting close-out (whole feature)

- [ ] `/simplify` on each PR's diff once functionally done.
- [ ] `pnpm pr-tests` locally after opening each PR.
- [ ] End-to-end manual verify with the real VAPID key: compose from backstage → member device gets push + inbox unread; spotlight installed PWA gets an Everyone broadcast.
- [ ] Update `docs/data-models.md` with the four new collections.

## Self-review notes (author)

- **Spec coverage:** audiences (Task 6,7,11), channels per app (PR3 inbox / PR4 push-only), data model (Task 3,4,7), send flow incl. retry:false/best-effort/prune/stats (Task 7,8), SW conflict + spike gate (Task 13), permission subject + ExecutiveCommittee seed (Task 1,2), rules incl. inbox lock cross-check (Task 4,5), owner VAPID op (top), testing (per task), stacked-PR delivery (PR1–4). Out-of-scope items are not tasked (correct).
- **Idempotency:** inbox doc id = notification id, asserted in Task 7 Step 1 case 3.
- **Type consistency:** `Audience` shape identical in `@luminova/types` (Task 3) and beacon (Task 6) — beacon keeps its own copy because the functions bundle does not import client `@luminova/types` schemas (firebase/firestore types); the discriminant literals match exactly.
- **`INBOX_MUTABLE_FIELDS` ↔ rules `hasOnly(['read'])`** cross-checked in Task 5.
