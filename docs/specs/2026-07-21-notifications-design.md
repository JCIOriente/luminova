# Push Notifications + In-App Inbox — Design

**Date:** 2026-07-21
**Status:** Approved (brainstorm), pending implementation plan
**Scope:** `packages/types`, `packages/auth`, `packages/firebase`, `apps/beacon`, `apps/backstage`, `apps/spotlight`, `firestore.rules`

## Goal

Now that both frontends are installable PWAs, deliver push notifications to
everyone who installed the app, plus a richer in-app inbox for JCI Oriente
members. v1 is a **manual compose** tool: an authorized user writes a message in
backstage, picks an audience, and sends. No automatic event-driven triggers in
v1.

## Audiences

- **Members** installed **backstage**; they have an authenticated identity (uid +
  CASL claims + `roleIds`).
- **Public** installed **spotlight**; anonymous, no identity.

Audience picker (compose form):

| Audience | Reaches | Delivery |
|----------|---------|----------|
| Everyone | all backstage + spotlight installers | push only for anon; push + inbox for members |
| Members | all provisioned members | push + inbox |
| Role: Directors / Exec-committee / any role | members holding that role | push + inbox |

Spotlight (anon) only ever receives **Everyone** broadcasts — it has no identity
to match Members/Role audiences, and no inbox.

## Channels per app

- **Backstage (members):** push **and** a Firestore-backed inbox (bell icon,
  unread badge, history). Inbox is independent of push — a member who denied OS
  permission still sees messages.
- **Spotlight (anon):** push **only**. Tap opens a deep-link URL. Nothing stored.

## Data model

### `notifications/{id}` — composed message (source of truth + audit)

```
{
  title: string,
  body: string,
  url: string | null,                 // deep-link opened on tap
  audience: { type: "everyone" | "members" | "role", roleId?: string },
  createdBy: string,                  // uid
  createdAt: Timestamp,
  stats: { pushSent: number, pushFailed: number } | null  // written back by trigger (Admin SDK)
}
```

The admin **create** of this doc is what triggers the send. It doubles as the
audit record and the compose history source.

### `members/{uid}/notifications/{id}` — fan-out inbox copy (backstage only)

```
{ title, body, url, read: boolean, createdAt: Timestamp }
```

The send trigger writes one copy per matching member, with **deterministic doc id
= the parent notification id** (so a retry overwrites rather than duplicates).
Owner-read rules → trivial unread badge + history. Written only by the Admin SDK
(fan-out), never by the client. The client may update **only** the `read` field.

### Token storage — no FCM topics

Web FCM clients cannot subscribe to topics, so we store tokens and multicast in
≤500 batches, pruning dead tokens on send.

- `members/{uid}/fcmTokens/{token}` — backstage member device. Owner-writable.
  Tied to uid → role-filterable at send time.
- `pushTokens/{token}` — spotlight anon device. Public-create, bounded shape, no
  PII (mirrors the `leads` collection precedent). No read/list.

Audience → tokens:

- `everyone` = all member tokens ∪ all `pushTokens` (anon)
- `members` / `role` = member tokens filtered by `roleIds`

Fan-out inbox targets matching **members** regardless of whether they hold a
token (inbox is the durable channel; push is best-effort on top).

Scale note: chapter membership is tens to low-hundreds. Fan-out writes +
multicast are well within limits and keep rules and unread trivial. No topics, no
cron.

## Send flow — beacon trigger

New function `onNotificationCreated = onDocumentCreated("notifications/{id}")`:

```
1. Parse audience. Malformed → return null (no throw → no retry storm).
2. Resolve MEMBER set:
   - everyone / members → all provisioned members (.select uid, roleIds)
   - role → members where roleIds array-contains roleId
   chunk(300) the reads (reuse apps/beacon/src/chunk.ts).
3. Fan-out inbox: batch-write members/{uid}/notifications/{id}
   = { title, body, url, read:false, createdAt } per member. Idempotent
   (deterministic id → retry overwrites).
4. Resolve TOKENS:
   - member tokens: read each member's fcmTokens subcollection
   - if audience=everyone: also read all pushTokens (anon spotlight)
5. Push: getMessaging().sendEachForMulticast in ≤500 batches.
   data payload: { url }. On UNREGISTERED / invalid-argument per token →
   delete that token doc (inline prune).
6. Write stats back onto notifications/{id} (pushSent / pushFailed).
```

**`retry: false`.** A redeliver would re-push (users get duplicate OS
notifications — push is not idempotent). Fan-out and stats are idempotent, but we
accept **best-effort push**: log failures, do not retry. Inbox is the durable
channel. Dead-token pruning is inline (no cron). `chunk()` at 300 for reads, 500
for the FCM multicast cap.

## Permission & token registration (client)

Web Push requires: a VAPID key, a background service worker, and the user
granting OS permission.

### Service-worker conflict (the real gotcha)

Both apps use `vite-plugin-pwa` **generateSW** (workbox precache,
`registerType: "prompt"`). FCM needs its own background handler. Plan: keep
generateSW untouched and add a **separate** static `firebase-messaging-sw.js`
that FCM registers explicitly via
`getToken({ serviceWorkerRegistration })` — least risk to the existing precache.
A spike during planning confirms this vs. injecting FCM `importScripts` into the
workbox SW.

### Shared client

FCM client init lives in `@luminova/firebase` behind a new **lazy** `/messaging`
entry (keeps messaging off the critical path, matches the split-barrel perf
pattern). Foreground messages (`onMessage`) surface via the existing
`@luminova/ui` toast (OS notification is suppressed when the tab is focused).

### Backstage (members)

- After login, a **soft in-app prompt** ("Activa notificaciones") — never the raw
  browser prompt cold. On accept → `getToken` → write
  `members/{uid}/fcmTokens/{token}`.
- Refresh handling; delete the token doc on logout.

### Spotlight (anon)

- Small dismissible soft prompt. On accept → `getToken` → write
  `pushTokens/{token}`.
- iOS only supports web push for an **installed** PWA (16.4+). Show the prompt on
  iOS only when running in `display-mode: standalone`, else it silently no-ops.

### Manual owner ops (cannot be done from the repo)

- Enable the Cloud Messaging API and generate the **VAPID key pair** in the
  Firebase Console (like the existing reCAPTCHA / reset-URL owner ops). Listed as
  a manual step in the plan.

## Authorization

New CASL subject **`Notification`** added to `packages/types` `SUBJECTS`.

- **`create:Notification`** — compose + send. Gates the `/notificaciones` compose
  route (`useCan("create","Notification")`) **and** the `notifications` rules
  `create`.
- **`read:Notification`** — view sent-history.
- **Inbox is owner-scoped** — no permission; every member reads their own
  `members/{uid}/notifications`.

`Admin` covers both via `manage:all` automatically. Default built-in grant:
**ExecutiveCommittee** gets `create:Notification` + `read:Notification` (they own
comunicados) — added to `BUILT_IN_ROLE_PERMS`.

## Firestore rules

- **`notifications/{id}`** — create: holder of `create:Notification`, and only the
  trigger-consumed shape (title/body/url/audience/createdBy/createdAt; `stats`
  absent on create). read: holder of `read:Notification` (compose history). No
  client update/delete (stats written by Admin SDK, bypasses rules).
- **`members/{uid}/notifications/{id}`** — read: owner (`uid ==
  request.auth.uid`). update: owner, **only the `read` field** (locked-field
  pattern + rules test). No client create/delete (Admin SDK fan-out only).
- **`members/{uid}/fcmTokens/{token}`** — create/delete: owner only; bounded token
  shape.
- **`pushTokens/{token}`** — create: public, bounded shape, no PII (mirrors
  `leads`). Anon device may delete its own token. No read/list.
- Admin-SDK writes (fan-out, stats, prune) bypass rules; the client paths above
  stay denied.

Mandatory reviews (per repo routing): `firestore-security-reviewer` +
`/security-review` (auth + rules + a new public-write collection). Rules mirror
the read-only-field invariants with tests ("rules mirror code" guardrail). The
`ACTIVITY_LOCKED_FIELDS`-style canonical locked-field set for the inbox `read`
field lives in `@luminova/types` with a rules⇄client cross-check.

## Backstage UI

- **Compose** — route `/notificaciones`, gated `useCan("create","Notification")`.
  RHF + Zod form: title, body, url (optional), audience picker (Everyone /
  Members / role list from `roles`). Submit = write `notifications` doc.
  Sent-history table below (gated on `read:Notification`), with per-message
  `stats`.
- **Inbox** — bell icon in app chrome; unread badge = count of `read:false` in
  `members/{uid}/notifications`. Panel lists recent; tap marks `read` +
  navigates `url`. Uses the 3-query-state pattern (loading / error / empty).

Scaffold via `backstage-feature-scaffold` (repository + TanStack Query + RHF +
Zod).

## Spotlight UI

- Soft push-permission prompt (dismissible, iOS-standalone-gated). No inbox, no
  routes. Reuses the shared `@luminova/firebase/messaging` client and a
  spotlight-local `firebase-messaging-sw.js`.

## Testing

- **beacon** (vitest + emulator): audience→member resolution, fan-out
  idempotency (retry overwrites, no dupes), token pruning on invalid-token,
  chunk boundaries, malformed-audience→null.
- **rules** (emulator): each collection allow/deny; inbox `read`-only-field lock;
  `pushTokens` public shape bound; non-holder cannot create `notifications`.
- **frontend**: permission-prompt gating, foreground toast, unread badge count,
  audience picker states.
- **Reviewers:** `firebase-functions-reviewer` + `firestore-security-reviewer` +
  `bundle-budget-watcher` (new lazy messaging chunk).

## Delivery — stacked PRs (one spec)

1. `types + auth + rules + beacon` — subject, seed grant, rules, send trigger,
   emulator tests.
2. `@luminova/firebase/messaging` client — lazy entry + shared init.
3. `backstage` — compose route + inbox.
4. `spotlight` — soft prompt + SW.

## Out of scope (v1)

- Automatic event-driven notifications (role assigned → notify, activity created
  → notify roster). Deferred; the trigger + data model are shaped to allow adding
  them later as new writers of `notifications/{id}`.
- Per-user notification preferences / mute categories.
- Scheduled / delayed sends.
- Per-program/project roster targeting (audience type could extend later).
```
