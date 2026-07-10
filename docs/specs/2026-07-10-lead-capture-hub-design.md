# Central Reach Hub — Lead Capture + WhatsApp + Difusión Oriente

**Date:** 2026-07-10 · **Status:** In progress · **Slug:** `lead-capture-hub`

## Problem

`apps/spotlight/src/routes/contact.tsx` submits the "Contáctanos" form via `mailto:` only. It
opens the visitor's email client and **persists nothing**. JCI Oriente has zero visibility of who
reaches out — every prospective member or ally is lost the moment they close the tab. There is no
WhatsApp entry point on the public site (only inside `/enlaces`), and the **Difusión Oriente**
WhatsApp broadcast channel is not surfaced anywhere.

## Goal

Turn `/contact` into a **central reach hub** with an intent-based channel ladder, and persist every
form submission as a **lead** so admins get a "Prospectos" inbox in backstage. This converts a
black-hole form into a lightweight top-of-funnel CRM for member + ally growth.

## Locked decisions

- **Persist to Firestore** (replaces `mailto`) → backstage inbox = the visibility.
- **Inbox-only alerts** — no email infra now (beacon untouched).
- **Status pipeline** — `Nuevo → Contactado → Cerrado`, filterable by intent + status.
- **WhatsApp: all three** — direct `wa.me` chat + Difusión Oriente channel subscribe, both stored in
  president-editable `siteConfig`.

## Data model — `leads` collection (new)

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | 1–100 chars |
| `email` | string | ≤200 chars, email-shaped |
| `intent` | enum | `Membresía \| Alianza \| Prensa \| Otro` (Spanish UI values) |
| `message` | string | 1–2000 chars |
| `status` | enum | `Nuevo \| Contactado \| Cerrado` — born `Nuevo` |
| `source` | string | `"web"` (reserved for future channels) |
| `createdAt` | Timestamp | server timestamp, `== request.time` at create |
| `deletedAt` | Timestamp \| null | soft delete; immutable once set |

Types mirror the **Ally** three-file pattern: `lead.ts` (interface + enums), `lead-schema.ts`
(public form input `LeadInput`), `lead-doc-schema.ts` (Firestore read shape for `parseDocs`).
New CASL subject `"Lead"` in `permission.ts` (Admin `manage:all` covers it; custom roles can be
granted `read:Lead` via the permission matrix).

## Security — first public-writable collection (the crux)

`leads` is created by **unauthenticated** visitors — the repo's first public write surface. Rules:

- **create** (any caller, incl. anon): `keys().hasOnly([...])` (no extra fields), string length caps,
  `intent` in enum, `status == "Nuevo"`, `source == "web"`, `createdAt == request.time`,
  `deletedAt == null`. This is a strict schema gate — a bot can only write a well-formed lead.
- **read**: `canDo('read','Lead')` only — leads hold PII emails, never world-readable.
- **update**: `canDo('update','Lead')`, `affectedKeys().hasOnly(['status','deletedAt'])`, `status`
  in enum, `deletedAt` immutable once set. Admins advance the pipeline; nothing else mutable.
- **delete**: `false` (soft delete via `deletedAt`).
- **`leads` has no `active` field** → cannot reuse `softDeleteSafe()` (it reads `resource.data.active`
  and throws on the missing field). Uses a `.get('deletedAt', null)`-based immutability guard.

**Firebase App Check** is the recommended bot hardening (`request.app != null`). Spotlight does not
have App Check provisioned yet; gating create on `request.app` now would block **all** writes. So we
ship without it and add a **client honeypot field + submit throttle** as interim abuse mitigation.
App Check enforcement is a tracked fast-follow. Flagged for `/security-review` +
`firestore-security-reviewer`.

## Rollout — 3 stacked PRs (merge in order)

1. **Contract** (this PR): `packages/types` lead trio + `"Lead"` subject + `SUBJECT_LABELS` entry;
   `firestore.rules` `leads` block; rules tests (valid anon create passes; extra-field / oversized /
   bad-intent / status≠Nuevo / anon-read / non-admin-read denied; admin read + status update pass).
2. **Reach hub**: spotlight `/contact` redesign (WhatsApp + Difusión Oriente CTAs + form → Firestore
   write via `firebase/firestore/lite` `addDoc`, three UI states, honeypot); `siteConfig.contact`
   gains `whatsapp` + `broadcastChannel` (defaults + `safe-href` guard); backstage config editor
   gains both fields.
3. **Prospectos inbox**: backstage `features/leads` (repository + hooks + `_app.leads` route +
   `LeadTable` + status/intent filters + pipeline actions), permission-gated nav entry.

## Verification

See the plan file; per-PR: rules tests green, emulator round-trip (form write → doc → inbox),
`/security-review` clean + stamped, `pnpm pr-tests` green.
