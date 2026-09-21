# Invite-link onboarding — operator-shared links, no Firebase email

## Problem

Firebase's transactional email is unusable for JCI Oriente. The templates cannot be
meaningfully restyled, the sender is `noreply@<project>.firebaseapp.com`, and the link points at
`<project>.firebaseapp.com/__/auth/action?…` before redirecting to our handler. It reads as
phishing and lands in spam. JCI Oriente operators coordinate over WhatsApp.

So: **no Firebase email anywhere in the auth flow.** An operator with `create:MemberLogin`
generates a link and shares it by hand.

This replaces the flow `docs/specs/board-seat-delegation.md` describes, where the invite email was
explicitly "not the privileged part" because `requestPasswordReset` was a client-side
`sendPasswordResetEmail`. After this lands there is no mail at all, and the **link is the whole
credential** — which changes what `create:MemberLogin` means. See "Security posture change".

## The flow, end to end

### New member

1. Operator (Admin, or a `create:MemberLogin` delegate) creates the member — invite drawer, or
   "Invitar acceso" from the members table / profile header.
2. Backstage calls `issueMemberInvite({ memberId })`.
3. beacon: runs the guards, creates the Auth account if the member has none, links `uid`, sets the
   base `Member` claim, mints a single-use token, writes `memberInvites/{sha256(token)}`, projects
   `members/{id}.invite`, and returns `{ token, expiresAt, email, replacedPreviousLink }`.
4. Backstage assembles `https://<origin>/invitacion#<token>` and shows it in a copy dialog with the
   expiry date in Spanish. The operator sends it over WhatsApp.
5. The invitee opens it. `describeInvite({ token })` returns `{ email, name, expiresAt }`; the page
   shows "Crea tu contraseña, <nombre>" and the address the account belongs to.
6. They set a password against the existing `PASSWORD_RULES` checklist. `redeemInvite({ token,
   password })` burns the token and sets the password through the Admin SDK.
7. Confirmation renders in the same UI, with a link to `/login`. They are **not** auto-signed-in.

### Recovery (an already-provisioned member)

Identical from step 2 on, except the member already has a `uid`, so beacon skips account creation
and goes straight to minting. Entry point is the same control, relabelled "Recuperar acceso"
(derived from invite state, not hand-typed per surface). Re-issuing **revokes** any outstanding
link; the UI says so before and after.

There is no self-service path. `/forgot-password` is deleted (D2).

---

## Decisions

### Q1 — Redemption mechanism: **(a) `redeemInvite({token, password})`, Admin SDK `updateUser`**

The password transits beacon over TLS inside the callable body. Accepted.

**Why (b) — `createCustomToken` + `signInWithCustomToken` + `updatePassword` — is rejected.**
Two independent blockers, either sufficient:

1. **No existing use, so it needs an unverified owner-op IAM grant.** `grep -rn "createCustomToken"
   apps packages` over the whole repo returns nothing. `createCustomToken` requires the runtime
   service account (`953870918238-compute@developer.gserviceaccount.com`, per `docs/ci-cd.md:191`)
   to hold `roles/iam.serviceAccountTokenCreator`. This project has prior pain with exactly that
   grant. Option (b) therefore makes the entire onboarding flow depend on an IAM change nobody has
   verified, on a path with no fallback — the invitee just gets a 500.
2. **It fights this app's own routing contract.** `apps/backstage/src/routes/_auth.tsx` `beforeLoad`
   awaits `context.auth.ready` and `throw redirect({ to: "/" })` if a user is present. The
   redemption page lives under `_auth`. `signInWithCustomToken` would make the invitee signed-in
   *while sitting on that route* — the router bounces them to `/` before `updatePassword` runs. This
   is not hypothetical; it is the file as written.
3. Additionally: a redeemed-but-abandoned token under (b) leaves a signed-in Auth account with **no
   password set**, reachable by nothing (there is no recovery mail any more) and invisible to the
   operator — the invite reads "usada" while the member cannot log in.

**What (a) costs and how it is contained.** The plaintext password is in the request body and in
beacon's memory. Mitigations that are actually built:
- `redeemInvite` never logs `request.data`. Its structured log line is
  `{ memberId, tokenPrefix: hash.slice(0, 8), outcome }` — nothing else. A unit test asserts no
  console argument contains the token or the password string.
- The password policy is enforced **server-side**, not only by the client zod schema. The rule
  predicates move to a zod-free `@luminova/types/password-policy` consumed by both
  `apps/backstage/src/features/auth/types/password-policy.ts` (which keeps the Spanish labels and
  the zod wrapper) and beacon. Today `PASSWORD_RULES` is client-only; claiming a policy that a
  direct callable invocation bypasses would be guardrail #6.

### Q2 — Token shape, storage, verification

**Entropy.** `crypto.randomBytes(32)` → 256 bits → base64url, 43 characters. 16 bytes would already
be unguessable; 32 costs nothing in a link the operator pastes into WhatsApp (total URL ≈ 70 chars,
one line, no wrapping) and takes brute force out of the threat model entirely rather than requiring
an argument about it.

**Storage — the hash IS the document id.** `memberInvites/{sha256hex(token)}`. Not a field on a
queried doc: a keyed `get()` is bounded by construction (guardrail #5), needs no index, and cannot
be enumerated. Consequence worth stating: **there is no secret comparison anywhere in our code**, so
the timing-safe-comparison question dissolves — a wrong token derives a different key and resolves
to a nonexistent document. `crypto.createHash("sha256")` over a fixed-length input is constant work.

**Why a fast hash is correct here.** bcrypt/scrypt/argon2 exist to slow offline brute force against
*low-entropy human-chosen* secrets. The input is 256 bits of CSPRNG output; there is nothing to
brute force. Adding a KDF would mean a new dependency through `secure-dep-vetting` for zero
security gain. SHA-256 is in Node core.

**Document shape** (`memberInvites/{tokenHash}`):

| Field | Type | Why |
|---|---|---|
| `memberId` | string | resolves the invitee |
| `uid` | string | the Auth account this link may write to, **pinned at issue** |
| `email` | string | snapshot at issue; shown on the page and compared at redemption |
| `kind` | `"initial" \| "recovery"` | operator copy + audit |
| `issuedBy` | string | caller uid — makes D3's impersonation primitive auditable |
| `issuedAt` / `expiresAt` | Timestamp | `expiresAt = issuedAt + 7d` |
| `status` | `"pending" \| "used" \| "revoked"` | single-use + revocation |
| `usedAt` / `revokedAt` / `revokedBy` | Timestamp \| string \| null | audit trail |
| `purgeAt` | Timestamp | TTL field, `issuedAt + 90d` |

`uid` on the doc is load-bearing: it is what stops a stale link from writing a password onto a
*different* Auth account after an out-of-band relink.

**TTL — 7 days.** The operator sends the link on a Friday afternoon; the member reads WhatsApp on
Monday. 24 h (roughly what a Firebase oobCode gives, console-controlled) is precisely the failure
this feature exists to remove. 30 days is a bearer credential sitting in a chat thread for a month.
Seven days covers a full week plus a weekend and renders legibly: "vence el 28 de septiembre".

**Single use, and the ordering problem.** `auth.updateUser` is not transactional with Firestore, so
one of two failure modes must be chosen:

- Flip `pending → used` in a Firestore transaction **first**, then `updateUser`. A crash between
  burns the token; the member needs a new link.
- `updateUser` first, then flip. A crash between leaves a **live token and a set password** — a
  replay window.

**We claim the token first.** A burned token is an annoyance with a one-click operator remedy; a
replayable one is a credential leak. On `updateUser` failure beacon `console.error`s the failure
(guardrail #4) and returns a tagged refusal telling the invitee to ask for a new link. The
transaction is also the mutual-exclusion primitive for two tabs racing.

**Re-issue revokes — and does so without a query.** `members/{id}.invite.tokenHash` points at the
one outstanding invite, so re-issuing reads the member doc it already has, writes
`status: "revoked"` + `revokedAt` + `revokedBy` on exactly that document by key, and then mints.
**At most one outstanding invite per member, by construction.** No `where` query, no composite
index, no owner-op. This is the concrete advantage over a Firebase oobCode, which silently
invalidates the previously-sent code with no record and no way to tell the operator — see Q6 for how
it surfaces.

**Indistinguishability — deliberately partial, and here is the reasoning.** An *unknown* token
returns the generic `invite-invalid`. *Expired*, *used* and *revoked* return distinct tagged
reasons. This is not a leak: you cannot reach any of those three states without already holding a
real 256-bit token, so the only thing the response confirms is something the caller already
possesses. Merging them would cost the invitee the one piece of information that makes the page
actionable ("expiró — pide otro" vs "ya la usaste — inicia sesión"), which is the dead-end
`PROVISION_BLOCK_REASONS` exists to remove.

**Firestore TTL policy — cleanup, not the boundary.** A TTL policy on `purgeAt` reaps documents ~90
days after issue. Say it plainly: **TTL deletion is best-effort with documented lag (up to ~24 h),
so it is not what makes a link expire.** Expiry is `expiresAt <= Timestamp.now()` compared inside
the redemption transaction. 90 days keeps used and revoked docs readable for audit well past any
plausible incident window, then reaps them so the collection does not grow without bound.
Configuring the policy is an owner-op (see the plan's blocking-ops section); the feature is correct
without it, just untidy.

### Q3 — The unauthenticated trust boundary

**The claim, verified.** `grep -n "onCall(" apps/beacon/src` returns five call sites:
`provisionMemberLogin`, `setUserRoles`, `seedRoles`, `recomputeAllClaims`,
`reseedBuiltInRolePerms`. Every one opens with `requireAdmin` or `requireAdminOrPerm`
(`apps/beacon/src/callable-auth.ts`), both of which throw `unauthenticated` on `!request.auth`.
`describeInvite` and `redeemInvite` are therefore the **first unauthenticated callables in this
project**.

**Brute force.** 2^256. A guess resolves to a nonexistent document id — one Firestore read, no
write, no side channel, no distinguishable latency (the key derivation is constant work and the
"missing doc" path is the cheapest one).

**Rate limiting — we are deliberately not building one, and here is why.** A per-token attempt
counter is meaningless: each guess addresses a *different* nonexistent document, so there is nothing
to count against. A global counter means a Firestore write per unauthenticated request — a
self-inflicted DoS and a cost lever handed to the attacker. Inventing a limiter in this document
that the plan does not build would be guardrail #6. The controls that are real:

- 256-bit entropy (guessing is not a threat model, it is arithmetic);
- 7-day TTL, enforced in code;
- single-use, enforced transactionally;
- explicit revocation on re-issue;
- `maxInstances: 10` set on both callables, so a flood cannot scale out and consume the project's
  whole function budget. That is an availability control we actually configure.

**App Check — NOT enforced, and this is not a hedge.** `packages/firebase/src/app-check.ts`
initializes App Check only `if (siteKey)`, reading `VITE_APPCHECK_SITE_KEY`; `docs/roadmap.md:227`
records G4 as 🟡 — "client code scaffolded … Remaining = infra: provision key, set env, flip
enforcement", and `:379` lists it under "Owner ops (not PRs)". **The keys do not exist in
production.** Setting `enforceAppCheck: true` here would 403 every redemption until an owner
provisions reCAPTCHA. What we do instead: both callables are declared
`onCall({ enforceAppCheck: false, maxInstances: 10 }, …)` with a comment naming G4, so the flip is
one boolean and is greppable, and `redeemInvite` is added to the G4 checklist as the first function
to flip. **Cost when it is flipped:** a reCAPTCHA v3 round-trip on an unauthenticated page, and a
hard dependency on `VITE_APPCHECK_SITE_KEY` being present in the backstage build — a misconfigured
deploy then breaks member onboarding entirely, silently, for everyone. That is a real operational
risk and is why it should be flipped deliberately, with the invite page tested, not as a sweep.

**Abuse logging.** One structured line per call:
`{ fn, memberId, tokenPrefix, outcome }`. Never the token, never the password, never
`request.data`. `tokenPrefix` is the first 8 hex chars of the **hash**, which is enough to correlate
an issue with its redemption in Cloud Logging and is not a credential. A unit test asserts the
secret never appears in a log argument.

**An attacker with a valid member's email but no token can do nothing.** Neither callable accepts an
email; `memberId` is resolved *from the token*. There is no endpoint mapping an address to a token,
and D2 deletes the one endpoint that used to accept a bare email
(`apps/backstage/src/lib/auth/request-password-reset.ts` → `sendPasswordResetEmail`). The
email-only attack surface strictly shrinks.

### Q4 — Token in the **URL fragment**: `https://<backstage>/invitacion#<token>`

**Why.** Firebase Hosting access logs record path and query, never the fragment. Nor does a
`Referer` header (fragments are stripped), nor any third-party script that reads `document.referrer`.
A query param or a path segment puts a live bearer credential into a log sink with a long retention
that nobody on this team controls.

**Router support — verified, no hack.** `@tanstack/react-router` ^1.170.11 (installed 1.171.9):
`ParsedLocation.hash` is a typed first-class field —
`node_modules/@tanstack/router-core/dist/esm/location.d.ts:30`, documented as "The hash of the
location, excluding the leading hash character." Read it with
`useLocation({ select: (l) => l.hash })`. No `validateSearch`, no `window.location` reach-around.
The SPA rewrite in `firebase.json` (`"source": "**" → "/index.html"`) preserves the fragment
because the fragment never reaches the server at all, and the PWA
`navigateFallbackDenylist: [/^\/__\/auth\//]` does not match `/invitacion`.

**Ergonomics.** WhatsApp linkifies through a fragment fine. 43 base64url chars keeps the whole URL
at roughly 70 characters — one line, no preview truncation, safely copy-pasteable. The Spanish path
`/invitacion` (no diacritic, so no percent-encoding) keeps it short.

**Honest caveat.** The fragment is still in browser history, still readable by any JS on the page,
and still copy-pasteable out of the chat. TTL + single-use + revocation are the real mitigations;
the fragment removes the *server-log and Referer* copies and nothing more.

**Deviation from the brief, flagged once.** The brief says beacon "returns a backstage URL." beacon
returns `{ token, expiresAt, email, replacedPreviousLink }` and the **client** assembles the URL from
`window.location.origin` through one shared helper,
`apps/backstage/src/features/members/lib/invite-link.ts`. Reason: beacon has no configuration
surface today beyond `process.env.GCLOUD_PROJECT` (`apps/beacon/src/index.ts:377`), so a base URL
would mean a new functions env/param and a deploy-time owner-op, and it would be wrong in the
emulator and in previews. One helper, not three, so the three surfaces cannot build three URLs
(guardrail #1).

### Q5 — Routing and the bundle

**Route.** `apps/backstage/src/routes/_auth.invitacion.tsx`, under the `_auth` layout — it is
unauthenticated, and the layout's `beforeLoad` already bounces an already-signed-in visitor.

**The rule that matters.** The route file exports **`Route` and nothing else.**
`docs/performance.md:133` records the `/me` regression verbatim: "its stray `export function
MemberHome` had disabled auto-code-splitting, dragging every member/initiative/activity hook (→
firestore) + zod doc-schemas into the entry." `autoCodeSplitting: true` is on in
`apps/backstage/vite.config.ts`; a second export switches it off for this file. The form lives in
`apps/backstage/src/features/auth/components/invite-redeem-form.tsx`.

**Callable import discipline.** `httpsCallable` + `getFunctionsService()` come from
`@luminova/firebase/functions`, which PR0 deliberately split out of the eager shell. The redemption
form imports it; because the form is only reachable from a split route, it stays in that route's
chunk. The failure mode to guard against is a *shared* module (e.g. `invite-link.ts`) acquiring a
functions import and being pulled eager — keep `invite-link.ts` a pure string builder.

**Budget accounting, honestly.** The budget is **162 kB gz eager** for backstage
(`tools/scripts/check-bundle-budget.sh`, "backstage eager JS", cross-referenced in
`docs/performance.md:73`); #225 measured 160 kB. Removing `/forgot-password` removes a *route*
chunk, so the eager saving is only the route-tree entry — small, single-digit kB at best. **Do not
claim the deletion pays for the addition.** Both routes are code-split; the eager delta of this
feature should be approximately zero, and the plan's verification step requires a *measured* before
/after `index-*.js` gz number rather than an assertion.

### Q6 — What the operator sees

**One predicate, one badge, three surfaces.** #225 consolidated the three entry points onto
`memberProvisionBlocked` (`apps/backstage/src/features/members/lib/provision-gate.ts`); this
preserves that shape rather than adding three copies.

- `apps/backstage/src/features/members/lib/invite-state.ts` —
  `memberInviteState(member, now): InviteState` where
  `InviteState = "never" | "pending" | "used" | "expired" | "revoked"`. `"expired"` is **derived**
  (`pending && expiresAt <= now`), not stored, so a link that lapsed without any beacon write still
  reads correctly. Also exports `inviteActionLabel(state)`.
- `apps/backstage/src/features/members/components/invite-state-badge.tsx` — the single renderer,
  using `@luminova/ui`'s `Badge` (tones from `BadgeTone`: `blue | teal | green | amber | red | gray
  | navy`).

| State | Label | Tone |
|---|---|---|
| `never` | Sin invitar | `gray` |
| `pending` | Pendiente · vence el {fecha} | `amber` |
| `used` | Usada el {fecha} | `green` |
| `expired` | Expirada | `gray` |
| `revoked` | Revocada | `red` |

| State | Action label |
|---|---|
| `never` | Invitar acceso |
| `pending` | Reenviar enlace |
| `used` | Recuperar acceso |
| `expired` / `revoked` | Generar enlace nuevo |

**Where each renders.**
- `member-profile-page.tsx` `InviteAccess` — badge beside the button; the button's label is
  `inviteActionLabel(state)` (replacing today's `member.uid ? "Reenviar acceso" : "Invitar acceso"`).
  Keep the `key={member.id}` and the `blocked`-as-prop-not-mount-gate shape — both comments in that
  file explain regressions that will recur if removed.
- `member-invite-drawer.tsx` — the done screen shows the link + badge instead of
  "Invitación enviada a …".
- `member-row-menu.tsx` — the menu item label comes from `inviteActionLabel`; the badge itself
  renders in an "Acceso" column on the members table, because a `MenuItem` is the wrong place for
  a status chip.

**Re-issue must say the old link is dead.** Before: a `Dialog` confirm reading *"Se generará un
enlace nuevo. El enlace anterior dejará de funcionar."* After, when
`result.replacedPreviousLink === true`, the copy dialog's title is *"Enlace nuevo — el anterior fue
revocado"*. This is the visible half of D1's advantage over an oobCode; without it the advantage is
only theoretical.

### Q7 — The delta to `provisionMemberLogin`

**Decision: one callable, renamed. `provisionMemberLogin` → `issueMemberInvite`.**

Rejected alternative — two callables (`provisionMemberLogin` + a separate `issueMemberInvite`) with
the client sequencing them: it reintroduces exactly the partial-failure class `#225` fought,
`use-provision-member-login.ts`'s long comment describes it ("the Auth account created, the uid
linked, and NO mail ever sent, with no error anywhere"), and it splits one trust boundary into two.
The operator has one action — "dale acceso a esta persona" — so there is one callable.

`issueMemberInvite({ memberId })`:
1. `requireAdminOrPerm(request, "create:MemberLogin")` — unchanged.
2. All the existing preconditions: member exists, `active === true`, `ADMIN_SDK_EMAIL_SHAPE`, the
   relink guard.
3. The restructured adoption/recovery guard + the power-seat and `hasDirectGrants` guards (below).
4. Create the Auth account if absent; `setClaims`; `linkUid` — unchanged.
5. Revoke the outstanding invite, mint the new one, project `members/{id}.invite`.
6. Return `InviteResult`.

`ProvisionDeps.passwordResetLink` is **deleted**, along with its adapter in
`apps/beacon/src/provision-deps.ts` (`auth.generatePasswordResetLink`). It was
`generatePasswordResetLink`'s oobCode URL — a bearer credential we no longer need and must not mint.

`InviteResult` becomes:

```ts
export interface InviteResult {
  email: string;
  token: string;
  expiresAt: number;            // epoch ms
  replacedPreviousLink: boolean;
}
```

`emailSent`, `fallbackLink` and `mailError` are **deleted**. They encoded "mail primary, link
fallback" as an invariant; after this change the link is the only delivery mechanism, always shown,
never a fallback. Keeping `fallbackLink` under any name would preserve a distinction that no longer
exists.

**Deploy-ordering caveat (real, must be sequenced).** Removing the `provisionMemberLogin` export
means a stale backstage tab calling it gets a 404. `firebase.json` sets `Cache-Control: no-cache`
on `**` for the backstage host, so the next navigation picks up the new bundle — the window is
short and the flow is low-frequency and operator-driven. Deploy `rules → functions → hosting`
(`pnpm deploy:all` already does this order). The conservative alternative — keep
`export { issueMemberInvite as provisionMemberLogin }` for one release — is available if the
operator cannot tolerate the window; it is not the default because a deprecated alias that nobody
removes is how dead exports accumulate.

**Test surface that must be rewritten** (line counts measured in the worktree):

| File | Lines | What changes |
|---|---|---|
| `apps/beacon/src/provision-member-login.test.ts` | 635 | renamed to `issue-member-invite.test.ts`; every `actionLink` assertion removed; new cases for the restructured guard, minting, revocation |
| `apps/beacon/src/provision-deps.test.ts` | 163 | the `passwordResetLink` port case deleted |
| `apps/backstage/src/features/members/hooks/use-provision-member-login.test.tsx` | 107 | rewritten wholesale — the `requestPasswordReset` mock (lines 9–16) and all `emailSent`/`fallbackLink`/`mailError` assertions go |
| `apps/backstage/src/features/members/components/member-profile-page.test.tsx` | 512 | the `request-password-reset` mock (lines 79–96) deleted; all `InviteAccess` assertions rewritten onto invite state + the copy dialog |
| `apps/backstage/src/features/members/components/member-invite-drawer.test.tsx` | 518 | the `DoneState` fixtures rewritten; the mail-failure branch removed; the "Detalle: AppCheck token is invalid" case (454/467) survives as the generic-error case |
| `apps/backstage/src/features/members/components/member-row-menu.test.tsx` | 280 | label assertions move from `member.uid ? …` to `inviteActionLabel(memberInviteState(...))` |
| `apps/backstage/src/features/auth/components/forgot-password-form.test.tsx` | 44 | **deleted** |
| `apps/backstage/src/features/auth/components/reset-password-form.test.tsx` | 53 | **deleted** (see Q9) |
| `apps/backstage/src/features/auth/components/login-form.test.tsx` | 68 | line 45 `"/forgot-password"` assertion |
| `apps/backstage/src/components/nav-config.test.ts` | — | `AUTH_ROUTES` (line 25) |

### Q8 — Invitee identity

**Display, do not collect.** Collecting the email would add an oracle (submit an address, learn
whether it matches) and would ask the invitee for something the token already determines.

**Two unauthenticated callables, sharing one loader.** `describeInvite({ token })` is a read-only
lookup returning `{ email, name, expiresAt }`; it does **not** consume the token. `redeemInvite({
token, password })` consumes it. Both go through one `loadInvite(db, token, now)` so the validity
rules cannot drift. Rejected alternative — a single overloaded `redeemInvite` whose behaviour
depends on whether `password` is present: two behaviours behind one name, and the read path would
inherit the write path's transaction. The second endpoint is cheap (one keyed read, no write) and
returns only what a token holder is already entitled to know. It is also what makes guardrail #3
satisfiable: the page has genuine loading / error / absent states because it genuinely fetches.

**Show the full address, unmasked.** The token holder is the intended recipient; showing
`ana@jci.bo` is how they confirm the operator sent the right link. Masking protects nobody who
holds the token — they could simply redeem it.

**If the member changed between issue and redemption**, the invite is refused. The invite doc
snapshots `uid` and `email` at issue; redemption re-reads the live member doc and requires:

| Condition | Reason tag |
|---|---|
| member doc absent | `invite-member-missing` |
| `member.active !== true` | `invite-member-inactive` |
| `member.email !== invite.email` (normalized) | `invite-email-changed` |
| `member.uid !== invite.uid` | `invite-account-changed` |

The last two are the important ones. `firestore.rules` never constrains `members.email` (the
existing `provision-member-login.ts` adoption-guard comment says so at length), so any
`update:Member` holder can change it after a link is out. Honouring a stale link would set a
password on an account whose address an operator has since corrected — or, worse, on an account the
member has since been relinked away from. On the page all four collapse to one Spanish message:
*"Este enlace ya no es válido. Pídele a quien te invitó que te envíe uno nuevo."* — expired and used
keep their own distinct copy.

### Q9 — Removing `/forgot-password`, and the fate of `/reset`

Every reference (grepped), and what happens to it:

**Deleted outright**
- `apps/backstage/src/routes/_auth.forgot-password.tsx`
- `apps/backstage/src/features/auth/components/forgot-password-form.tsx` (+ `.test.tsx`)
- `apps/backstage/src/lib/auth/request-password-reset.ts` — its only consumers are
  `forgot-password-form.tsx` and `use-provision-member-login.ts:58`, both going away
- `apps/backstage/src/routes/_auth.reset.tsx`
- `apps/backstage/src/features/auth/components/reset-password-form.tsx` (+ `.test.tsx`)
- `apps/backstage/src/lib/auth/confirm-password-reset.ts` (`verifyPasswordResetCode` /
  `confirmPasswordReset`)

**`/reset` is dead code, unambiguously.** It exists solely to consume Firebase's oobCode, which
after this change arrives from nowhere. A live route reachable only by a mail we no longer send is
exactly the guardrail-#6 lie ("a guard named in docs MUST actually exist and be wired"), and
`pnpm knip` runs in `pr-tests` and will flag the orphaned modules anyway.

**Edited**
- `apps/backstage/src/features/auth/components/login-form.tsx:78` — the `<Link to="/forgot-password">`
  becomes non-link copy: *"¿Olvidaste tu contraseña? Pídele a la directiva que te envíe un enlace de
  acceso."* The existing CEL footnote (`jci.orienteolm@gmail.com`) stays and is now the actual
  escape hatch.
- `apps/backstage/src/features/auth/components/login-form.test.tsx:45`
- `apps/backstage/src/components/nav-config.test.ts:25` — `AUTH_ROUTES` becomes
  `["/login", "/invitacion"]`. This test asserts
  `CONTENT_ROUTES == NAV_PATHS ∪ AUTH_ROUTES`, so both the removal and the addition are mandatory.
- `apps/backstage/src/routeTree.gen.ts` — regenerated by `@tanstack/router-plugin`, never hand-edited.
- `docs/architecture.md:77`, `docs/features.md:24`, `docs/firebase-setup.md:427`,
  `docs/roadmap.md:216` (FX6) and `:227` (G4).

**Not edited:** `docs/plans/*`, `docs/superpowers/*` and `docs/specs/2026-06-*`. Those are a
historical record of what was decided when; rewriting them to match today erases the reason this
document exists.

**Reused, not re-typed** (guardrail #1). `features/auth/types/password-policy.ts`
(`PASSWORD_RULES`, `passwordSchema`), `features/auth/components/password-checklist.tsx`,
`auth-screen.tsx`, `brand-side.tsx`, and `types/reset-schema.ts` — renamed to
`types/set-password-schema.ts` (`setPasswordSchema`), since "reset" no longer names anything real.
`InviteRedeemForm` inherits `ResetPasswordForm`'s markup and its four-phase shape wholesale; because
`ResetPasswordForm` is deleted in the same change there is no second copy to extract from, so no
premature abstraction is warranted.

One thing **is** extracted, because it reaches its second occurrence:
`provisionRefusalMessage` / `provisionErrorMessage`
(`apps/backstage/src/features/members/lib/provision-error.ts`) read `err.details.reason` and look it
up in a prototype-safe `Map`. The invite page needs the identical mechanism for
`InviteBlockReason`. Extract `apps/backstage/src/lib/callable-refusal.ts` exporting
`refusalMessage(err, table: ReadonlyMap<string, string>): string | null`, and have
`provision-error.ts` and the new `features/auth/lib/invite-error.ts` each supply their own
exhaustive `Readonly<Record<Reason, string>>`. The prototype-pollution reasoning in
`provision-error.ts`'s comment moves with the helper.

**Locked-out-admin recovery — the operator note D2 makes mandatory.** There is no self-service
recovery after this lands. Two paths, in preference order:

1. **Another Admin** uses "Recuperar acceso" in backstage. All guards in `issueMemberInvite` are
   `!callerHoldsAdminRole`, so an Admin is subject to none of them.
2. **Firebase Console**, by a project Owner/Editor: Authentication → Users → find the account →
   ⋮ → *Edit user* → set a password directly (or ⋮ → *Reset password*, which sends Firebase's own
   mail — still available from the console even though the app no longer uses it).

Therefore: **the chapter must keep at least two Admin accounts at all times.** Path 1 is the
in-product one and it requires a second Admin to exist. This is now an operational requirement, not
a nicety.

### Q10 — Rules and parity

**`memberInvites` is beacon-only. Clients never read it.**

```
// Invite tokens. The doc id IS sha256(token) — a bearer credential's hash. Written and read
// ONLY by beacon's issueMemberInvite / describeInvite / redeemInvite through the admin SDK,
// which bypasses these rules. No client has any business here: the invite STATE clients need
// is projected onto members/{id}.invite, and the token itself must never be listable.
match /memberInvites/{tokenHash} {
  allow read, write: if false;
}
```

**Why a projection onto the member doc, not a client read of `memberInvites`.** Granting
`create:MemberLogin` holders read access would make every invite hash listable by anyone who can
enumerate the collection, for a state that is three scalars. The projection costs nothing: the three
operator surfaces already hold a `Member` object from `useMember` / the members table, so there is
no new query, no new cache key, no new loading state, and no bundle delta.

`members/{id}.invite` (beacon-owned, mirroring how `uid` is owned):

```ts
interface MemberInviteProjection {
  status: "pending" | "used" | "revoked";
  kind: "initial" | "recovery";
  tokenHash: string;
  issuedAt: Timestamp;
  expiresAt: Timestamp;
  issuedBy: string;
  usedAt: Timestamp | null;
}
```

`tokenHash` is on the projection deliberately: it is an irreversible SHA-256, not a credential, and
it is what lets revocation be a **keyed write** instead of a collection query (guardrail #5). Its
presence is what makes "at most one outstanding invite, revocable without an index" true.

**Rules must mirror that ownership (guardrail #2).** The members `create` arm uses targeted negative
checks (`!('uid' in request.resource.data)`, `!('publicProfile' in …)`), **not**
`keys().hasOnly()` — so an unknown field is *not* already denied there. Two edits:

- `memberWriteInvariants()` (firestore.rules:306) gains `&& !touched('invite')`, directly beside the
  existing `!touched('uid')`.
- The members `create` arm gains `&& !('invite' in request.resource.data)`.

The other three arms are already closed: the takedown arm is `hasOnly(['publicProfile'])`, the
positions lane is `hasOnly(['positions'])`, and the self lane runs `selfProfileValid`, which is an
explicit six-key allowlist.

**Which tests, and which ones are *not* warranted.**

- `tests/firestore-rules/rules.test.ts` — `memberInvites` gains an entry in the `DELETE_DENIED`
  table (`{ name: "memberInvites", path: "memberInvites/h1" }`). This is not optional: the
  "no drift" test asserts `parseDeleteDeniedCollections(RULES_SOURCE)` equals that table exactly,
  and an `allow read, write: if false` block matches the parser
  (`tools/scripts/lib/rules-delete-denied.mjs`), so the suite goes red until reconciled.
- `tests/firestore-rules/rules-coverage.test.ts` — `memberInvites` gains a `KNOWN_UNSURFACED` entry:
  `"beacon-owned invite tokens; state is projected onto members/{id}.invite, never client-read"`.
  Omitting it fails the orphan detector.
- `rules.test.ts` — a deny loop over the existing principals asserting that a write touching
  `invite` is rejected on create and on update, for Admin, for a `manage:Member` holder, on the self
  lane and on the positions lane.
- **Not built, and here is why:** a `cargo-assignment-parity`-style emulator test for
  `memberInviteState`. That predicate mirrors nothing in `firestore.rules` — rules do not compute
  invite state, they only deny writing it. Inventing a parity test for a mirror that does not exist
  would be theatre.
- **Built instead**, because *this* mirror does exist: `tests/firestore-rules/invite-guard-parity.test.ts`
  (no emulator needed). The client's `memberProvisionBlocked`
  (`apps/backstage/src/features/members/lib/provision-gate.ts`) mirrors beacon's guards, and D3
  changes both. Following the precedent that `cargo-assignment-parity.test.ts` set by importing
  `assignable-cargo-core.ts`, the beacon guard predicates are extracted into
  `apps/beacon/src/invite-guards.ts` with **type-only** cross-package imports (the rules-test package
  cannot resolve `@luminova/types` at runtime), and the test asserts
  `clientOffersInvite ⟹ beaconGuardsAllow` over a fixture table — the same implication, not equality,
  discipline that file documents.

---

## Security posture change from D3, stated plainly

**D3:** recovery for an already-provisioned member is available to any `create:MemberLogin` holder,
not Admin-only. The user was told this hands delegates an impersonation primitive and chose it.

### What is being relaxed, and what is not

The current single guard in `provision-member-login.ts` is:

```ts
if (!callerHoldsAdminRole && (user !== null || linkedUid !== null)) throw provisionBlocked(…)
```

Its comment explains both halves. It is **split**, not loosened wholesale:

1. **Adoption branch — `user !== null && user.uid !== linkedUid`. Stays Admin-only, unchanged.**
   This is the branch the comment's account-takeover scenario runs through: a delegate files a
   member doc carrying a sitting Admin's email, and `adoptedClaims()` + `linkUid()` + the returned
   link hand over that Admin's account. Nothing in D3 asks for adoption.
2. **Recovery branch — `linkedUid !== null && user?.uid === linkedUid`. Now open to a delegate**,
   subject to every other guard.

**The key claim, and why relaxing (2) does not reopen (1).** The takeover works by making
`members.email` point at someone else's account — `firestore.rules` never pins `email`, so a
`manage:Member` holder can rewrite it. But an email pointing at a *different* Auth account is, by
construction, `user.uid !== linkedUid`, which lands in branch 1 or in the pre-existing relink guard
(`linked-to-different-login`). Walked through concretely:

- *Delegate provisions a puppet, then rewrites the puppet's email to the president's.* `linkedUid`
  = puppet uid; `getUserByEmail(president)` → president's uid ≠ puppet uid; the relink guard fires
  first (`getUserByUid(puppetUid)` is live) → `linked-to-different-login`. Refused.
- *Delegate rewrites the **president's** member doc email to their own address.* `linkedUid` =
  president uid; `getUserByEmail(evil)` → null or the delegate's own uid, neither equal to
  `linkedUid`; relink guard → live president account → `linked-to-different-login`. Refused.
- *Delegate targets the president with the email untouched.* Recovery branch, but the president is
  seated on an Admin-granting cargo → power-seat guard. Refused.
- *Delegate targets a grant-free ordinary member.* Allowed. This is D3's intent.

**One guard the member-doc checks cannot cover, so it is added.** `hasDirectGrants()` and
`readCargoIds()` read the **member document**. Recovery targets a **live Auth account**, which can
carry claims the member doc does not explain — an orphaned Admin claim, or claims minted before a
cargo was removed (`syncMemberClaims` does not recompute on cargo removal until the next member
write; see board-seat-delegation operator note 4). So the recovery branch adds
`accountIsPrivileged(user)`: refuse when `user.customClaims.roles` contains anything beyond
`Member` / `Scanner`, or when `user.customClaims.perms` is non-empty. New tag
`privileged-account-requires-admin`. The `Member`/`Scanner` allowlist is the same one
`adoptedClaims()` already uses, kept as one exported constant so the two cannot drift.

### After this lands, a `create:MemberLogin` delegate…

| Target | Delegate may issue a link? | Guard that decides |
|---|---|---|
| New, unprovisioned, grant-free, unseated member | **yes** | none fire — the delegation's purpose |
| Provisioned ordinary member: no cargo, no `roleIds`, no `permissionOverrides.grant`, claims = `[Member]` | **yes (new)** | this is D3 |
| Member seated on any grant-conferring cargo, **any term** | no | power-seat guard (`readCargoIds` reads every term key) |
| Member with `roleIds` or `permissionOverrides.grant` | no | `hasDirectGrants()` |
| The president, or any CEL power cargo | no | power-seat guard |
| Account holding an Admin claim with a clean member doc | no | `accountIsPrivileged()` (**new**) |
| Member whose doc email ≠ their Auth account's email | no | relink guard → `linked-to-different-login` |
| Member with no Auth account whose email matches an existing one | no | adoption guard (**unchanged**) |
| Member with an unreadable / malformed `cargoId` | no | fail-closed: `getPositionGrants` → `null` → refuse |
| Inactive or `Desafiliado` member | no | `active !== true` precondition |
| Themselves | yes, and it is harmless — they already have their own session |

### The residual, named

**A delegate can take over any ordinary grant-free member's account.** Mint a recovery link, redeem
it themselves, and be that member — reading the directory, the points ledger, that member's `/me`.
That is an impersonation primitive over the ordinary membership, it is inherent to D3, and no guard
in this design closes it.

What this design *does* do is make it **auditable rather than silent**, which is worth building:
`memberInvites` records `issuedBy` + `issuedAt` + `kind: "recovery"`, and
`members/{id}.invite` surfaces it, so the profile page can render *"Acceso recuperado el 12 de
septiembre"*. Before this change, the equivalent act (`sendPasswordResetEmail` from any signed-in
client) left no record anywhere at all.

---

## Data model

`memberInvites/{sha256hex(token)}` — see Q2 for the field table.
`members/{id}.invite` — see Q10 for the projection shape.

New shared contracts in `@luminova/types`, following the `PROVISION_BLOCK_REASONS` precedent (a
runtime `as const` array so the client's message table can be proved exhaustive by iterating the
contract, plus a derived union type; beacon imports the **type** only so the zod-laden barrel stays
out of the functions bundle):

```ts
export const INVITE_BLOCK_REASONS = [
  "invite-invalid",                     // unknown or malformed token — deliberately generic
  "invite-expired",
  "invite-used",
  "invite-revoked",
  "invite-member-missing",
  "invite-member-inactive",
  "invite-email-changed",
  "invite-account-changed",
  "invite-password-weak",
  "invite-update-failed",               // token burned, Auth write failed — ask for a new link
] as const;
```

`PROVISION_BLOCK_REASONS` gains `"privileged-account-requires-admin"`.

New zero-dependency `@luminova/types/password-policy` subpath (alongside the existing `./engine`,
`./permission`, `./role-definition` subpaths) holding the rule predicates, so beacon can enforce
the same policy the checklist renders.

---

## Operator notes

1. **Keep at least two Admin accounts.** D2 removes self-service recovery. The in-product path for
   a locked-out Admin is another Admin clicking "Recuperar acceso"; without a second Admin the only
   remedy is a Firebase Console op by a project Owner (Authentication → Users → ⋮ → Edit user → set
   password).
2. **Re-issuing kills the previous link.** This is the point of the feature, not a side effect. The
   confirm dialog says so, and the badge flips the old invite to "Revocada". If the member replies
   "el enlace no sirve", check whether someone re-issued.
3. **Links last 7 days.** The badge shows the date. After that, generate a new one; there is no
   extension.
4. **A link is a credential.** Whoever holds it sets that member's password. Send it in a direct
   chat, not a group. There is no way to un-send; the remedy is to re-issue, which revokes it.
5. **The Firebase "Password reset" template is no longer used by the app.** Do **not** disable the
   Email/Password provider — sign-in depends on it. The console's own reset action still works and
   is the Owner-level escape hatch in note 1.
6. **A delegate cannot recover a privileged member.** If "Recuperar acceso" is refused with "solo un
   administrador puede…", that member holds a cargo, direct grants, or a privileged claim. An Admin
   must do it.
7. **Recovery is recorded.** Every invite carries who issued it and when, and the profile page shows
   it. If a member reports an unexpected password change, that record is where to look.
8. **A failed issue after account creation still escalates to an Admin.** Unchanged from
   board-seat-delegation note 3: if the Auth account was created but the call then failed, a
   delegate's retry hits the adoption guard (`user !== null`, `linkedUid === null`). Finish it from
   an Admin account.

---

## Known, not fixed

1. **A delegate can impersonate any ordinary member** (see "The residual, named"). Inherent to D3.
   Auditable, not prevented.
2. **The password crosses beacon in plaintext** (Q1a). TLS-protected, never logged, but it is in
   function memory and in any future request-body capture. Closing this means Q1b and the IAM grant.
3. **App Check is not enforced on the unauthenticated callables.** The keys do not exist (roadmap
   G4). The code is one boolean away; the infra is an owner-op. Until then these two endpoints
   accept requests from any origin.
4. **No rate limiting beyond `maxInstances`.** Deliberate (Q3). If abuse ever materialises, the
   right fix is Cloud Armor or an App Check flip, not a Firestore counter.
5. **An operator who opens an invite link while signed in is bounced to `/` with no explanation.**
   `_auth.tsx`'s `beforeLoad` redirects any authenticated visitor, and a child route cannot remove a
   parent's `beforeLoad`. Workaround: a private window. Fixing it means moving `/invitacion` out
   from under `_auth` and re-implementing the signed-out guard there.
6. **TTL cleanup is best-effort.** Expiry is code-enforced, but a used invite document may linger
   past `purgeAt` by up to ~24 h. Harmless; noted so nobody reads the collection size as a bug.
7. **`members.email` is still unconstrained by `firestore.rules`.** Every guard in this design works
   *around* that fact rather than fixing it. Pinning email — uniqueness, or an immutability rule —
   would simplify the whole adoption/recovery split and is the single highest-value follow-up.
8. **Nothing disables or deletes an Auth account.** Unchanged from board-seat-delegation note 9: no
   `deleteUser` and no `updateUser({ disabled: true })` anywhere in `apps/beacon/src`. Revoking a
   delegate's code does not undo an account they caused to exist.
9. **The invite projection is not backfilled.** Members provisioned before this lands have
   `uid` set and no `invite` field, so they read as `never` — "Sin invitar" for someone who has an
   account. The action label for that state is "Invitar acceso", which is merely inaccurate copy,
   not a broken action (issuing works fine). A one-off backfill script writing
   `invite: { status: "used", … }` for every member with a `uid` is possible and is deliberately not
   in scope; the state self-corrects on the first issue.

## Out of scope

Email verification. Magic-link sign-in. Self-service password change from `/me` (the member can
always ask an operator). Any second delivery channel (SMS, WhatsApp Business API). Pinning or
de-duplicating `members.email`. Backfilling the invite projection.
