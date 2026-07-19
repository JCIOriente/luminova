# Backstage authorization audit — 2026-07-18

**Scope:** `apps/backstage` authz surface (CASL abilities, sidebar nav, ⌘K command
menu, route `beforeLoad` guards, in-page `<Can>`/`useCan` gates), `firestore.rules`,
and `apps/beacon` callables — crossed against every principal.
**Baseline:** `main` with PR #183 merged (`08a4dcb`).
**Method:** multi-agent workflow (extract → synthesize → adversarial per-finding
verify → report). 10 candidate mismatches emitted, each independently traced
end-to-end with a default-refute verifier. **6 confirmed, 4 refuted.**

## Why this audit exists

PR #183 fixed a **CASL conditional-grant leak**: a plain Member saw the admin
*Miembros* nav + route, which then died on a Firestore list the rules correctly
denied. The fix made nav visibility and route guards share one predicate — an
**empty-instance probe** `ability.can(action, subject(S, {}))` that only
unconditional grants satisfy, mirroring what `firestore.rules` allows for a list.

The goal here is to prove the fix holds in **both** directions across all principals:
- **no over-grant** — the UI never offers a surface the rules deny (dead pages,
  swallowed permission-denied), and
- **no under-grant** — the UI never hides a surface the rules actually entitle
  (locked-out roles, dead escape hatches).

### Headline result

The **over-grant** direction (the class that triggered the audit) is now clean: the
`/members` and `/initiatives` leaks are verified closed and no sibling surface
re-opens them. But the fix's mechanism — **detail routes inherit their parent
*list* nav gate via the `navItemForPath` prefix match** — **over-corrected into a
cluster of under-grants**: management-tier list gates now lock lower-privilege
principals out of *detail* routes that `firestore.rules` explicitly entitle them to
(direction-lead Members, perms-only custom roles). That cluster (C6/C7/C5) plus two
role-vs-perm drifts on `/leaderboard` (C1) and one swallowed cross-collection read
(C2) are the confirmed findings.

---

## Methodology

1. **Extract** (3 parallel, sonnet) — (A1) effective CASL grants per principal from
   `ability.ts` + `BUILT_IN_ROLE_PERMS`; (A2) `firestore.rules` parsed to a
   per-collection × per-operation capability table + each beacon callable's guard;
   (A3) every nav item / route / ⌘K entry / `<Can>` gate and the queries each route
   fires.
2. **Synthesize** (opus) — cross-join into the principal × surface × collection
   matrix below; every expected-vs-actual gap emitted as a candidate.
3. **Verify** (opus, one agent per candidate) — trace the exact path
   (ability → nav gate → route guard → page query → rules predicate),
   **CONFIRM only if a real reachable gap exists, else REFUTE.** Verifier assigns
   final severity.
4. **Report** — this document. One verifier (C8) failed the structured-output retry
   cap; C8 was verified by hand instead (see its entry).

---

## Principal legend

| # | Principal | Effective grants (relevant) |
|---|---|---|
| 1 | Admin | `manage:all` (unconditional everything) |
| 2 | Membership | `manage:Member`, `read/create/update:Ally`, `read:Event/MemberPoints/Position` |
| 3 | Treasury | `manage:Payment`, `read:Member`, `read:MemberPoints` |
| 4 | ExecutiveCommittee | `read:Member/Ally/Event/MemberPoints/Program/Project`, `create/update:Event`, `manage:Position` |
| 5 | ProjectManager | `manage:Project/Activity/Program`, `read:Ally`, `create/update:Event`, `checkIn:Attendance` (uncond) |
| 6 | Scanner | `checkIn:Attendance` (cond `scannerEventIds`), `read:Activity` (uncond) |
| 7 | Member | `read/update:Member{uid}` (cond), `read:MemberPoints/Event/Project/Position` (uncond) |
| 8 | roleless | none |
| 9 | Custom (perms-only) | whatever `claims.perms` holds; `hasAnyRole`==false for every built-in name |

## (A) Nav / route visibility matrix — ✓ visible · ✗ hidden · ⚠ mismatch vs `firestore.rules`

| Nav item (gate) | Adm | Mbr | Trs | EC | PM | Scn | Mem | Rl | Cus(manage:Position) |
|---|---|---|---|---|---|---|---|---|---|
| `/` Inicio (always; MemberOnly→/me) | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠✓ | →/me | ⚠✓ | ✓ |
| `/me` (always) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/members` (`read:Member` empty-probe) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/allies` (`read:Ally`) | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/leads` (`read:Lead`) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/point-rules` (`read:PointRule`) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/leaderboard` (roles[Adm,Mbr,Trs,EC,PM]) | ✓ | ✓ | ✓ | ✓ | ⚠✓ | ✗ | ✗ | ✗ | ✗ ⚠ custom w/ `read:Member` |
| `/positions` (`read:Position` AND (roles[Adm,Mbr,EC] OR `manage:Position`)) | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| `/permisos` (roles[Adm]) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/activities` (`read:Activity`) | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `/initiatives` (`read:Program`) | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/config` (roles[Adm]) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

## (B) Route primary-query vs rules — where a nav grant and the page's own reads disagree

| Route | Principal(s) | Primary query fired | Rules verdict | Finding |
|---|---|---|---|---|
| `/leaderboard` | **ProjectManager** | `useMembers()` = `getDocs(members, where active==true)` unfiltered | `members` list needs `canDo('read','Member')`; **PM has neither perm nor self-uid** → denied | **C1** ⚠ nav admits PM by role, rules deny → dead page |
| `/activities` | **ProjectManager, Scanner** | `useMembers()` **ungated** (`_app.activities.tsx:46`) | `members` denied (no `read:Member`) | **C2** ⚠ ungated cross-collection read, error swallowed |
| `/initiatives/$type/$id` | **Member in `directionUids`** | route gate inherits `/initiatives` = `read:Program` | rules grant `isDirection()` writes; Member has `read:Project` not `read:Program` | **C6** ⚠ direction-lead Member redirected off own project → `isDirection` UI dead |
| `/activities/$id` | **Member directing parent** | route gate inherits `/activities` = `read:Activity` | rules grant `activityParentDirection()` writes; Member lacks `read:Activity` | **C7** ⚠ `isParentDirection` photo grant unreachable |
| `/leaderboard` | **Custom role w/ `read:Member`** | nav = pure roles allowlist, **no `orCan`** | rules would allow the `members`/`memberPoints` reads | **C5** ⚠ perms-only role locked out (`/positions` has the escape hatch, this doesn't) |
| `/` dashboard | Scanner, roleless | `useMembers()`, `useAllies()` | reads denied | **C4** — **refuted** (real Scanner always also holds Member → redirected; roleless not producible) |

## (C) Collections with no client surface / inert or latent grants

| Item | Verdict |
|---|---|
| **`events` collection** — live `create:Event`/`update:Event` rules but **no schema, no repository, no beacon writer, no seed, no nav/route**; `Event` subject exists only in ability grants + rules + tests | **C8 confirmed (Low, reframed).** Not the soft-delete gap first hypothesized (the docs carry no `active`/`deletedAt`, so `softDeleteSafe()` doesn't apply) — it's an **orphaned rules surface**: any role holding `create/update:Event` (Membership, EC, PM, custom) could stuff arbitrary docs into `/events/*` via the SDK. Same *claim==reality* class as the removed `board` collection (#144). |
| **`payments` / `manage:Payment`** — Treasury's defining perm targets a collection absent from `firestore.rules` (catch-all deny at :510) | **C9 refuted.** Inert grant, reaches nothing, exposes nothing. Optional housekeeping only. |
| **`manage:all`/`manage:Role` from `claims.perms`** honored by `buildAbility` with no guard | **C10 refuted.** Every write feeding the perms claim is Admin-role-gated in rules; only an Admin (who already holds `manage:all`) could author it. No lower-priv path. |
| **bare `ability.can('read','Member')`** in `_app.activities_.$id.tsx:58` + `member-row-menu.tsx:38` (not the empty-probe) | **C11 refuted.** Latent only — no conditional-only Member ever reaches these components (route/nav gates block first). Cosmetic consistency nit. |

## (D) Consistent — verified aligned (no finding)

- Admin `manage:all` — intended full grant (the one case an empty-probe pass is correct).
- `/permisos`, `/config`, `MemberRolesPanel`, provisioning, point-rules seed — UI
  `ActionGate role=Admin` **matches** rules' Admin-role-exclusive gates + `requireAdmin`
  callables (both layers role-gate, so perms-only customs are denied in both — no drift).
- `canFeatureInitiatives` (UI role[Adm,PM]) == rules `canCurateFeatured` (role[Adm,PM]).
- `/members` nav correctly hides Member (conditional `read:Member{uid}` fails the empty-probe) — **#183 fix intact.**
- `/initiatives` nav keyed on `Program` not `Project` correctly hides Member's unconditional `read:Project` — **#183 fix intact.**
- `/positions` `orCan:manage:Position` correctly re-admits custom roles — hardened.
- Scanner `checkIn` conditional on `scannerEventIds` fail-closed; check-in tab uses instance-probe `subject('Attendance',{eventId})` — correctly scoped.
- roleless — fully empty ability, correct fail-closed baseline.
- beacon `provisionMemberLogin` / `setUserRoles` — `requireAdmin` gated; `awardPoints` trigger is event-driven, no client invoke path.

---

## Confirmed findings (ranked by severity)

### C6 — High · under-grant · direction-lead Member locked out of their own initiative
**Where:** `apps/backstage/src/components/nav-config.ts:102` (Program gate reused for
the detail route via prefix-match at `nav-config.ts:132`, consumed by `_app.tsx:21`);
dead escape hatch `apps/backstage/src/routes/_app.initiatives_.$type.$id.tsx:121-124`.

**Failure scenario:** A user whose only role is `Member` is assigned director of a
project; beacon mirrors their uid into `projects/{id}.directionUids`
(`firestore-store.ts:161-173`, role-independent). `firestore.rules` grant them the
report-completion + photo writes via `initiativeUpdateAllowed → isDirection`
(rules:192-193, 48-49) and read via `allow read: if signedIn()`. But opening
`/initiatives/project/{id}` triggers `_app.tsx:21` → `canAccessRoute`, which
prefix-matches the path to the `/initiatives` **list** item gated `subject:"Program"`.
A plain Member has `read:Project` but **not** `read:Program`, so the empty-probe
returns false and the guard redirects to `/` before the page renders. The
`isDirection` escape hatch (the *only* writes such a Member can perform) is
unreachable — the exact principal it targets is locked out of their own project.

**Fix:** Give the initiative-detail path its own nav/route entry (or a
`canAccessRoute` exception) gated on `subject:"Project"` — which every Member holds
unconditionally — instead of inheriting the list's `subject:"Program"`. Keep the
`/initiatives` **list** on `Program` so the admin catalog stays closed. In-component
`canRead`/`canUpdate`/`isDirection` already narrow writes correctly, so relaxing only
route reachability introduces no over-grant.

### C1 — Medium · role-vs-perm-drift · ProjectManager leaderboard is a dead page
**Where:** `apps/backstage/src/components/nav-config.ts:71`.

**Failure scenario:** PM sees *Clasificación* (role allowlist admits it) and opens
`/leaderboard`. `LeaderboardPage` fires `useMembers()` → unfiltered
`getDocs(members, where active==true)`. `firestore.rules:210-211` require
`canDo('read','Member')` for a list; PM's perms
(`manage:Project/Activity/Program`, `read:Ally/Event`, `checkIn`) include no
`read:Member`, so the list is denied → `isError` → the page shows only *"No se pudo
cargar la clasificación."*

**Fix:** Remove `ProjectManager` from the `/leaderboard` roles allowlist
(`nav-config.ts:71`) — the remaining roles all hold a members-read grant. Do **not**
add `read:Member` to PM (broadens data access beyond intent). Prefer re-gating the
item on a real capability via the empty-probe (see C5) so it can't drift again.

### C2 — Medium · over-grant · `/activities` fires an ungated members read, error swallowed
**Where:** `apps/backstage/src/routes/_app.activities.tsx:46`.

**Failure scenario:** Scanner / ProjectManager legitimately reach `/activities` via
`read:Activity`. Line 46 calls `useMembers()` with no `enabled` gate; the resulting
unfiltered `members` list is denied by the rules for both principals. The hook only
destructures `data` (no `isError`), so the permission-denied is **silently
swallowed** — `directorById` collapses to `{}` and every card renders blank director
names/avatars. The sibling detail route (`_app.activities_.$id.tsx:72`) gates the
same query with `enabled: canReadMembers`.

**Fix:** Mirror the detail route — gate the list's `useMembers` on
`useAbility().can("read","Member")`. Skips the rules-denied query for
Scanner/PM (director names simply omit) and removes the swallowed error. Violates
guardrail #4 (*no silent catch*) as written.

### C5 — Medium · role-vs-perm-drift · perms-only custom role locked out of `/leaderboard`
**Where:** `apps/backstage/src/components/nav-config.ts:67-72`.

**Failure scenario:** An admin mints a custom role granting `read:Member` (no
built-in role name). `firestore.rules` allow that principal every dataset
`/leaderboard` loads (members via `canDo('read','Member')`; memberPoints/terms via
`signedIn()`). But the nav item is a **pure roles allowlist with no `orCan`** —
`hasAnyRole` is false and `orCan` is undefined, so both nav and `canAccessRoute` hide
it. A role the rules fully entitle is locked out. (`/positions` already solved this
with `orCan:manage:Position`; `/leaderboard` didn't get the same treatment.)

**Fix:** Add `orCan: { action: "read", subject: "Member" }` to the `/leaderboard`
item — admits the perms-only custom role via the `ability.can(orCan…)` branch,
matching the rules. (Also resolves C1 cleanly if the allowlist is dropped in favor of
the capability gate.)

### C7 — Medium · under-grant · parent-direction Member locked out of activity detail
**Where:** `apps/backstage/src/components/nav-config.ts:92` (governs `/activities/$id`
via `navItemForPath:130-133` + `canAccessRoute:140-143` + `_app.tsx:21-23`); dead
escape hatch `_app.activities_.$id.tsx:97-101`.

**Failure scenario:** A plain-Member director of Project P (uid mirrored into
`P.directionUids`, role-agnostic) is granted by rules both read
(`allow read: if signedIn()`) and photo/detail update on P's child activities
(`activityParentDirection()`, rules:324-331,358). But `/activities/$id` inherits the
`/activities` **list** gate `subject:"Activity"`, which a Member lacks, so `_app.tsx`
redirects to `/`. The `isParentDirection → canManagePhotos` hatch is unreachable.

**Fix:** Decouple the detail route guard from the list nav gate — `/activities/$id`
should require only `signedIn` (mirroring `allow read: if signedIn()`) while the
`/activities` **list** stays management-gated. Same structural fix as C6.
*Note:* for read:Activity holders the hatch also needs read on the parent; Scanner
lacks `read:Program/Project`, so confirm the intended beneficiary set — custom roles
with `read:Activity + read:Project` already work.

### C8 — Low · claim==reality · orphaned `events` collection with live write rules
**Where:** `firestore.rules:301-306`; `Event` subject in
`packages/types/src/permission.ts` + `role-definition.ts`.

**Failure scenario:** `/events/{id}` has `allow create: if canDo('create','Event')`
and `allow update: if canDo('update','Event')`, but **nothing in the codebase reads
or writes the collection** — no schema/type, no repository, no beacon, no seed, no
nav/route. Any authenticated principal holding `create/update:Event` (Membership, EC,
PM, or a custom role) could write arbitrary junk to `/events/*` directly via the SDK.
No data exposure or escalation — just an unused, writable rules surface.

**Fix:** Remove the orphaned surface — drop the `/events` match block (or set
`allow create, update: if false`) and prune the `Event` subject from `SUBJECTS` +
`BUILT_IN_ROLE_PERMS` (and its `Eventos` label in `permission-matrix.ts`) until a real
events feature exists. Add a rules test asserting `/events` writes are denied.
*Verify the `Event` grants aren't a placeholder for a planned feature before pruning.*

---

## Summary counts

| Severity | Confirmed | Findings |
|---|---|---|
| Critical | 0 | — |
| High | 1 | C6 |
| Medium | 4 | C1, C2, C5, C7 |
| Low | 1 | C8 |
| **Refuted** | — | C4, C9, C10, C11 |

| Tag | Confirmed |
|---|---|
| under-grant (detail route inherits list gate) | C6, C7 |
| role-vs-perm drift (`/leaderboard`) | C1, C5 |
| over-grant / silent-catch (`/activities`) | C2 |
| claim==reality (orphaned collection) | C8 |

**Over-grant direction (the #183 class): clean** — no principal is offered a
management surface the rules deny, except C2's swallowed `useMembers` (cosmetic blank
data, not exposure). The confirmed weight is **under-grants** introduced by the
detail-route-inherits-list-gate design.

---

## Recommended sequencing

**Fix-PR (`fix/authz-audit` off `main`, TDD w/ red/green) — SHIPPED in this PR:**
1. **C6 + C7 together** (one root cause): detail routes no longer inherit the parent
   list's management gate. Added `DETAIL_GATES` in `nav-config.ts` mirroring the rules'
   per-doc read (`/initiatives/` → `read:Project`; `/activities/` → signed-in), with
   red/green `canAccessRoute` tests proving a direction-lead Member reaches
   `/initiatives/$type/$id` and `/activities/$id` while the LIST routes stay closed.
   C7 also relaxes the activity-detail in-component `Sin acceso` gate to admit a
   parent-direction Member (`canRead || isParentDirection`).
2. **C1 + C5 together** (`/leaderboard` gate): replaced the role allowlist with a single
   `subject:"Member"` empty-probe gate — PM/Scanner/Member hidden, custom `read:Member`
   role admitted. Mirrors the page's members query.
3. **C2**: gated the activities-list `useMembers` on `read:Member` (kill the silent
   catch).

Auth/route-gate changes → **`/security-review` + `firestore-security-reviewer` run,
`Security-Reviewed` trailer stamped** before the PR. No `firestore.rules` change here.

**Tracked follow-ups (Low / housekeeping, separate — NOT in this PR):**
- **C8** — the orphaned `events` rules surface + `Event` subject. **Deferred:** it is
  NOT accidental cruft — `Event` carries deliberate ability⇄rules **reconciliation
  tests** (`tests/firestore-rules/rules.test.ts:638-647,1849,1884-1886`;
  `packages/auth/src/ability.test.ts:160`) and is wired into `BUILT_IN_ROLE_PERMS` for
  4 roles. Pruning it is a cross-boundary auth-model change that needs a product
  decision first (is `events` a planned feature?). If confirmed dead: remove the
  `/events` rules block + `Event` subject + the 4 role grants + the reconciliation
  tests, and add a rules test asserting `/events` writes are denied.
- **C9** — prune `manage:Payment` / `Payment` subject (or build the payments feature).
- **C4 (refuted)** — optional UX: send a Scanner-only principal to `/me` instead of
  the generic dashboard error card. Not a security fix.
- **C10 / C11 (refuted)** — optional defense-in-depth consistency: strip
  `manage:all`/`manage:Role` in `resolveEffectivePerms`; switch the two bare
  `ability.can('read','Member')` checks to the empty-probe helper. No runtime change.

---

*Generated by the `authz-audit` multi-agent workflow (run `wf_cde39dbc-0fe`):
extract (3× sonnet) → synthesize (opus) → adversarial verify (opus, 1 per candidate,
default-refute) → report. 10 candidates → 6 confirmed / 4 refuted.*
