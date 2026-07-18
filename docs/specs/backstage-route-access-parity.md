# Backstage route access ⇄ nav visibility parity

**Status:** implemented (fix/backstage-route-access-authz-parity)
**Date:** 2026-07-18
**Area:** `apps/backstage` authz — sidebar nav, route guards, CASL abilities

## Symptom

A freshly provisioned **Member** (role `["Member"]`), logged into the deployed
backstage, saw **Miembros** in the sidebar, opened `/members`, and got the red
error **"No se pudieron cargar los miembros."** Same latent shape on `/initiatives`
(Proyectos) and — by direct URL — every other management route.

## Root cause — a CASL conditional-grant leak

`packages/auth/src/ability.ts` grants a Member a **conditional** self-read:

```ts
case "Member":
  can(["read", "update"], "Member", { uid }); // own doc only, for /me
```

The nav gate (`nav-config.ts`) tested the **subject type** with no instance:

```ts
ability.can("read", "Member") // type-level check
```

CASL returns **true** for a type-level `.can()` whenever *any* conditional grant
exists — it answers "can you read *some* Member?", not "can you read *all*". So the
Member saw the item, the route (guarded only for auth, not role) rendered, and
`useMembers()` fired an **unconditional** `getDocs(members)` list. `firestore.rules`
correctly requires unconditional `read:Member` for a collection list and **denied**
it → `isError` → the red message.

The rules were right. The **client offered a page it could never load.**

A second, distinct leak on `/initiatives`: a Member carries an *unconditional*
`read:Project` (for `/me`'s participation names), and the item gated on
`anySubject: ["Program","Project"]` (OR) — so the Member passed on Project and leaked
into the admin catalog. This one an empty-instance probe can't catch (the grant is
unconditional), so the gate moved to `subject: "Program"` — the management signal no
Member holds.

## Who can actually list each subject (from `role-definition.ts`)

`read:Member` (unconditional): **Admin, Membership, Treasury, ExecutiveCommittee**.
`read:Program`: **Admin, ExecutiveCommittee, ProjectManager**. Not Member/Scanner.

## Fix

One access policy drives **both** nav visibility and route guards, so they can't drift.

1. **`isNavItemVisible` probes an empty subject instance** — `ability.can(action,
   subject(name, {}))`. An empty instance matches only **unconditional** grants,
   mirroring what `firestore.rules` allows for a list. Conditional own-doc grants
   stop leaking. Propagates to the sidebar *and* the ⌘K command menu.
2. **`/initiatives` gates on `subject: "Program"`** (was `anySubject`), excluding the
   Member's incidental `read:Project`.
3. **`canAccessRoute(pathname, claims, uid)`** — `navItemForPath` + `isNavItemVisible`.
   Ungated routes (`/`, `/me`) always pass; detail routes inherit their parent item
   via the existing path-prefix match.
4. **Central route guard in `_app.tsx` beforeLoad** — one choke point for every
   `_app` child (route files must export only `Route`, so a per-file guard was out).
   Denied → redirect `/`, which itself bounces a member-only user on to `/me`.
5. **`auth.ready` now settles claims before resolving.** It previously resolved right
   after `status:"authenticated"` but *before* `getIdTokenResult()` decoded claims —
   a latent race every `beforeLoad` guard shared. A privileged user could look
   role-less for a beat and get bounced. `ready` now resolves in the token-decode
   `finally` (8s timer stays armed as a backstop).

## The rule going forward

**A nav gate and its route guard must share one predicate, and that predicate must
mirror what `firestore.rules` actually allows.** For any subject with a *conditional*
grant (own-doc, event-scoped), never gate collection-level UI on the bare
`ability.can(action, Subject)` type check — probe an empty instance
(`subject(Subject, {})`) so only unconditional grants pass. Extends the
authz⇄UX-parity guardrail (`useCan` unification, backstage #118) and "Rules mirror
code" / "Claim == reality" in `docs/engineering-guardrails.md`.

## Related prod incident (same day, separate cause)

The invite/reset emails "never arriving" was **not** an email bug: the gen2 callables
(`provisionmemberlogin`, `setuserroles`) had lost their `allUsers` `run.invoker`
binding (empty Cloud Run IAM policy → platform 401 "Empty Authorization header" →
surfaced to the client as `FirebaseError: internal`). Fix:
`gcloud run services add-iam-policy-binding <fn> --member=allUsers
--role=roles/run.invoker`. `allUsers` invoker is required for every Firebase callable
and is safe — real auth is `requireAdmin` inside the function. Re-check after every
functions deploy; an org policy can re-strip it.
```
gcloud run services get-iam-policy provisionmemberlogin --region=us-central1 \
  --format="value(bindings.members)"   # empty = broken again
```
