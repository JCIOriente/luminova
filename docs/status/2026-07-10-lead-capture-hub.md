# Handoff — Central Reach Hub (Lead Capture + WhatsApp + Difusión Oriente)

**Date:** 2026-07-10 · **Spec:** `docs/specs/2026-07-10-lead-capture-hub-design.md`

Turns the black-hole `mailto:` contact form into a central reach hub: the form **persists a lead**
(admins get a Prospectos inbox), and the page surfaces **WhatsApp** + **Difusión Oriente** channels.

## Shipped — 3 stacked PRs (merge in order)

| PR | Branch (base) | What |
|----|---------------|------|
| **#150** | `feat/lead-capture-contract` (`main`) | Data contract: `packages/types` lead trio + `Lead` CASL subject; `firestore.rules` `leads` block (first public-writable collection); 24 rules tests. |
| **#151** | `feat/lead-capture-hub` (#150) | Spotlight `/contact` persists a lead via lite `addDoc` (3 states + honeypot); WhatsApp + Difusión Oriente CTAs; `siteConfig.contact.whatsapp`/`broadcastChannel` + backstage config editor fields. |
| **#152** | `feat/lead-capture-inbox` (#151) | Backstage **Prospectos** inbox: `LeadRepository` + hooks + `/leads` route (search, intent + status filters, `Nuevo → Contactado → Cerrado` pipeline, soft-delete), permission-gated nav. |

## Verification

- **#150:** 247 firestore-rules tests green (anon create shape-locked; admin-only read/list; triage-only update; soft-delete immutability; key-presence). types 199 tests + typecheck + lint.
- **#151:** types 199 / spotlight 55 / backstage 444 tests; typecheck + lint clean; spotlight build ok (contact route 20.47 kB gz < 40 kB; index 93.99 kB gz < 100 kB).
- **#152:** backstage CI green (eslint + tsc + 444 vitest); knip clean; leads route chunk 2.61 kB gz.
- **Reviews:** `/security-review` + `firestore-security-reviewer` on #150 (no Critical; hardened `deletedAt` key-presence) and #152 (no Critical/High; applied authz⇄UX parity, `enabled` gate, `QueryErrorState`, ordered read + index). Code-review on #151/#152 — no correctness bugs; `--danger` token + L1 ordering fixes applied. All three stamped `Security-Reviewed`.

## Decisions

- **Persist to Firestore, inbox-only alerts, status pipeline, all-three WhatsApp** — locked with the user up front.
- **Direct client write** (not a Cloud Function proxy) — matches the "beacon untouched" decision; the strict `leadCreateValid()` rule is the shape gate.
- **Honeypot + strict schema** as interim abuse mitigation; **App Check deferred** (see below).
- **English identifiers, Spanish values** — `Lead`/`intent`/`status` keys; `Membresía`/`Nuevo` values.

## Deferred / owner-ops (tracked in the spec's Deferred section)

1. **App Check (High).** The schema gate bounds a lead's *shape*, not its *volume*. `leads` is an open
   unauthenticated write endpoint until App Check is provisioned on spotlight + `request.app != null`
   added to the create rule. **Do not deploy #150's rules to prod ahead of App Check without
   consciously accepting the spam/storage window.**
2. **Provide the channel values.** WhatsApp number + Difusión Oriente invite link go in backstage
   `/config` (defaults ship empty → CTAs hidden until set).
3. **Deploy the `leads` composite index** (`firestore.indexes.json`, `deletedAt ASC, createdAt DESC`)
   before #152's ordered query runs in prod — CD `firebase deploy --only firestore` handles it.
4. **Low, on any future work:** email-format `matches()` in the rule *before* any automation reads
   `lead.email`; escape on CSV/`mailto` export if the inbox adds it; adopt shared error-state wrapper
   consistently (inbox already uses `QueryErrorState`).

## Next step

Merge #150 → #151 → #152 in order (each `gh pr merge` after the prior lands + rebases). Then remove the
worktrees (`git worktree remove .worktrees/lead-capture-{contract,hub,inbox}`). Provide the two channel
values in `/config`, and gate prod rules-deploy on App Check per Deferred #1.
