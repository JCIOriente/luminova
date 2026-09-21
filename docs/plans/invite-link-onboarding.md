# Plan — invite-link onboarding

Spec: `docs/specs/invite-link-onboarding.md`. TDD throughout: every step's test is written and
seen failing before the implementation. Checkpoint-commit each step; no step touches >10 files.

## Blocking / owner ops — read first

| # | Op | Blocks? | Notes |
|---|---|---|---|
| 1 | **No IAM grant is required.** | — | Stated as a positive outcome of choosing Q1(a). If anyone revisits Q1(b), `roles/iam.serviceAccountTokenCreator` on `953870918238-compute@developer.gserviceaccount.com` becomes a hard blocker. |
| 2 | **No composite index is required.** | — | Revocation is a keyed write via `members/{id}.invite.tokenHash`; there is no `where` query on `memberInvites`. If a future change adds one, it needs an index deploy. |
| 3 | **Firestore TTL policy** on `memberInvites.purgeAt` | **No** — cleanup only | Owner-op, after the first deploy: `gcloud firestore fields ttls update purgeAt --collection-group=memberInvites --enable-ttl --project=jci-oriente`. Expiry is code-enforced; without this the collection just grows. |
| 4 | **App Check keys (roadmap G4)** | **No** | Not required. Listed so it is not mistaken for a blocker. Add `redeemInvite` / `describeInvite` to the G4 checklist as the first functions to flip. |
| 5 | **Deploy ordering** | **Yes, at release** | `pnpm deploy:rules` → `pnpm deploy:functions` → `pnpm deploy:hosting`. `provisionMemberLogin` disappears; a stale tab 404s until it reloads (`Cache-Control: no-cache` on `**`, so one navigation). |
| 6 | **Firebase Console** | **No** | Do **not** disable the Email/Password provider. The "Password reset" template becomes unused by the app but stays available as the Owner-level escape hatch. |

---

## Step 1 — Shared contracts in `@luminova/types`

**Files (6):** `packages/types/src/invite-block-reason.ts`, `invite-block-reason.test.ts`,
`member-invite.ts`, `password-policy.ts`, `password-policy.test.ts`, `packages/types/package.json`
(+ `src/index.ts`, `src/member.ts`).

**Test first.** `invite-block-reason.test.ts`: the union array is non-empty and duplicate-free
(mirrors the shape of the existing provision-reason coverage). `password-policy.test.ts`: the rule
table — length, lowercase, uppercase, digit — accepts and rejects the expected inputs.

**Does.** `INVITE_BLOCK_REASONS` + `InviteBlockReason`. `MemberInviteProjection`, `InviteState`,
`INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000`, `INVITE_PURGE_MS = 90 * 24 * 60 * 60 * 1000`. A
zod-free `password-policy.ts` exporting `PASSWORD_RULE_IDS` and
`passwordPolicyViolations(value): readonly string[]`, exported as the `./password-policy` subpath
alongside `./engine` / `./permission` / `./role-definition`. Adds
`"privileged-account-requires-admin"` to `PROVISION_BLOCK_REASONS`. Adds optional
`invite?: MemberInviteProjection` to `Member` (`member.ts`) and to `memberDocSchema`
(`member-doc-schema.ts`).

**Verify.** `pnpm --filter @luminova/types test && pnpm --filter @luminova/types typecheck`

---

## Step 2 — Rewire backstage's password policy onto the shared predicates

**Files (2):** `apps/backstage/src/features/auth/types/password-policy.ts`,
`password-policy.test.ts`.

**Test first.** The existing `password-policy.test.ts` must still pass unchanged — it is the
regression net for the extraction.

**Does.** `PASSWORD_RULES` keeps the Spanish labels and the `id`s but takes its `test` predicates
from `@luminova/types/password-policy`. `passwordSchema` is unchanged. Guardrail #1: one definition
of the policy, two consumers (the checklist and beacon).

**Verify.** `pnpm --filter backstage exec vitest run src/features/auth/types/password-policy.test.ts`

---

## Step 3 — beacon: extract the pure guards

**Files (2):** `apps/beacon/src/invite-guards.ts`, `invite-guards.test.ts`.

**Test first.** Port the existing `hasDirectGrants` / `readCargoIds` cases out of
`provision-member-login.test.ts` (they are the fail-closed cases: non-array `roleIds`, array-shaped
`permissionOverrides`, `""` cargoId, `isSafeDocId`-rejected cargoId, future-term seats). Add
`accountIsPrivileged`: `roles: ["Member"]` → false; `["Member","Scanner"]` → false;
`["Member","Admin"]` → true; `perms: ["update:Showcase"]` → true; malformed claims → true
(fail closed).

**Does.** Moves `hasDirectGrants` and `readCargoIds` verbatim out of `provision-member-login.ts`
and adds `accountIsPrivileged(claims)` plus the exported `ADOPTABLE_ROLES = ["Member","Scanner"]`
that `adoptedClaims()` will now read from. **Type-only imports only** — this module is imported by
`tests/firestore-rules/`, which cannot resolve `@luminova/types` at runtime (the constraint
`assignable-cargo-core.ts` was split for).

**Verify.** `pnpm --filter beacon exec vitest run src/invite-guards.test.ts`

---

## Step 4 — beacon: the token module

**Files (2):** `apps/beacon/src/invite-token.ts`, `invite-token.test.ts`.

**Test first.** `mintInviteToken()` returns a 43-char base64url token and a 64-char lowercase-hex
hash; two calls never collide; `hashInviteToken(token)` is deterministic and equals the minted
hash; `isSafeTokenHash` accepts a real hash and rejects `""`, `"a/b"`, `"__x__"`, uppercase, and
anything not 64 hex chars (so a forged token can never build a weird doc path — the same discipline
as `isSafeDocId`).

**Does.** `crypto.randomBytes(32).toString("base64url")` and
`crypto.createHash("sha256").update(token).digest("hex")`. Node core only; no new dependency.

**Verify.** `pnpm --filter beacon exec vitest run src/invite-token.test.ts`

---

## Step 5 — beacon: `issueMemberInvite` (replaces `provisionMemberLogin`)

**Files (7):** `apps/beacon/src/issue-member-invite.ts` (git-mv of
`provision-member-login.ts`), `issue-member-invite.test.ts` (git-mv of its test),
`provision-deps.ts`, `provision-deps.test.ts`, `provision-errors.ts`, `apps/beacon/src/index.ts`,
`apps/beacon/CLAUDE.md`.

**Test first.** Extend the moved 635-line suite:
- every `actionLink` assertion deleted; the return is `{ email, token, expiresAt, replacedPreviousLink }`;
- adoption branch still refuses a delegate (`reprovision-requires-admin`) — the existing cases must
  survive verbatim;
- **new:** recovery branch (`linkedUid !== null && user.uid === linkedUid`) *succeeds* for a
  delegate on a grant-free, unseated, unprivileged member;
- **new:** recovery refuses on each of — power cargo any term, `hasDirectGrants`,
  `accountIsPrivileged` (`privileged-account-requires-admin`), `active !== true`;
- **new:** the two rewrite attacks from the spec both land on `linked-to-different-login`;
- **new:** minting writes `memberInvites/{hash}` with every field, and projects `members/{id}.invite`;
- **new:** re-issue sets the prior doc to `revoked` with `revokedBy` and returns
  `replacedPreviousLink: true`; a first issue returns `false`;
- **new:** the returned token never appears in any `console.*` argument.

**Does.** Renames the callable and its module; splits the single adoption guard into the adoption
branch (Admin-only, unchanged) and the recovery branch (delegate-allowed, plus
`accountIsPrivileged`); deletes `ProvisionDeps.passwordResetLink` and its adapter
(`auth.generatePasswordResetLink`); adds `revokeInvite` / `writeInvite` / `projectInvite` deps; adds
the new reason to `provision-errors.ts`; updates the export in `index.ts` and the function inventory
in `apps/beacon/CLAUDE.md`.

**Verify.** `pnpm --filter beacon exec vitest run src/issue-member-invite.test.ts src/provision-deps.test.ts`

---

## Step 6 — beacon: `describeInvite` + `redeemInvite`

**Files (4):** `apps/beacon/src/redeem-invite.ts`, `redeem-invite.test.ts`,
`apps/beacon/src/index.ts`, `apps/beacon/CLAUDE.md`.

**Test first.**
- `describeInvite` on a valid pending token returns `{ email, name, expiresAt }` and does **not**
  mutate the doc;
- unknown token → `invite-invalid`; expired → `invite-expired`; used → `invite-used`; revoked →
  `invite-revoked`;
- member absent / inactive / email changed / uid changed → the four tags from Q8;
- `redeemInvite` with a policy-violating password → `invite-password-weak`, and the token is **still
  pending** (policy is checked before the claim);
- happy path: the transaction flips `pending → used` with `usedAt`, the member projection updates,
  and `auth.updateUser(uid, { password })` is called exactly once with the invite's pinned uid;
- a second `redeemInvite` with the same token → `invite-used`;
- `updateUser` rejects → the token is `used` (burned), the thrown reason is `invite-update-failed`,
  and `console.error` was called;
- **no `console.*` argument contains the token or the password.**

**Does.** One shared `loadInvite(db, tokenHash, now)`. Both callables declared
`onCall({ enforceAppCheck: false, maxInstances: 10 }, …)` with the G4 comment. `redeemInvite` claims
the token in a `runTransaction` **before** calling `updateUser` (spec Q2). Structured log:
`{ fn, memberId, tokenPrefix, outcome }`.

**Verify.** `pnpm --filter beacon exec vitest run src/redeem-invite.test.ts` then `pnpm --filter beacon ci`
(runs eslint + tsc + vitest + `test:emulator`).

---

## Step 7 — `firestore.rules` + rules tests

**Files (4):** `firestore.rules`, `tests/firestore-rules/rules.test.ts`,
`tests/firestore-rules/rules-coverage.test.ts`, `docs/data-models.md`.

**Test first (all three go red before the rules change).**
1. `rules-coverage.test.ts` — add `memberInvites` to `KNOWN_UNSURFACED` with its reason.
2. `rules.test.ts` — add `{ name: "memberInvites", path: "memberInvites/h1" }` to `DELETE_DENIED`;
   the "no drift" test fails until the rules block exists.
3. `rules.test.ts` — new deny cases: no principal (Admin, `manage:Member`, self lane, positions
   lane) may set `invite` on create or touch it on update; no principal may read, create, update or
   delete `memberInvites/h1`.

**Does.** Adds the `match /memberInvites/{tokenHash} { allow read, write: if false; }` block with
its comment; adds `&& !touched('invite')` to `memberWriteInvariants()` (beside `!touched('uid')`,
firestore.rules:306) and `&& !('invite' in request.resource.data)` to the members create arm;
documents the collection in `docs/data-models.md`.

**Verify.** `pnpm --filter @luminova/firestore-rules-tests test` — boots the **Firestore emulator on
port 4010**, project `demo-rules-test`, behind `tools/scripts/with-emulator-lock.sh`.

---

## Step 8 — Guard-parity test

**Files (1):** `tests/firestore-rules/invite-guard-parity.test.ts`.

**Test first — it *is* the deliverable.** Imports `memberProvisionBlocked` from
`apps/backstage/src/features/members/lib/provision-gate.ts` and the predicates from
`apps/beacon/src/invite-guards.ts` (both type-only at the package boundary). Over a fixture table
of (principal × member shape × cargo), asserts `clientOffersInvite ⟹ beaconGuardsAllow` — an
implication, not equality, exactly as `cargo-assignment-parity.test.ts` documents. A header comment
states which conjuncts it does **not** cover (the Auth-directory checks — `user`, `linkedUid`,
`accountIsPrivileged` — which the client cannot see).

**Verify.** `pnpm --filter @luminova/firestore-rules-tests test`

---

## Step 9 — backstage: shared libs

**Files (8):** `apps/backstage/src/lib/callable-refusal.ts` (+ test),
`features/members/lib/invite-state.ts` (+ test), `features/members/lib/invite-link.ts` (+ test),
`features/auth/lib/invite-error.ts` (+ test), `features/members/lib/provision-error.ts`.

**Test first.** `invite-state.test.ts`: all five states, including `pending` past `expiresAt`
resolving to `expired` without a stored flag, and an absent `invite` on a member *with* a `uid`
resolving to `never` (the known backfill gap — pinned so it is a decision, not a surprise).
`invite-link.test.ts`: `inviteLink("abc", "https://x.test")` → `"https://x.test/invitacion#abc"`.
`invite-error.test.ts`: iterates `INVITE_BLOCK_REASONS` and asserts every one has a message;
`refusalMessage` returns `null` for `"toString"` / `"constructor"` (the prototype-pollution case
`provision-error.ts` documents).

**Does.** Extracts `refusalMessage(err, table)` into `lib/callable-refusal.ts` (moving the
prototype-safety comment with it) and rewrites `provision-error.ts` on top of it — guardrail #1,
second occurrence. `invite-link.ts` stays a pure string builder with **no** `@luminova/firebase`
import, so it cannot drag the SDK eager.

**Verify.** `pnpm --filter backstage exec vitest run src/lib/callable-refusal.test.ts src/features/members/lib src/features/auth/lib`

---

## Step 10 — backstage: hook + badge + profile surface

**Files (6):** `features/members/hooks/use-issue-member-invite.ts` (git-mv of
`use-provision-member-login.ts`) + its test, `features/members/components/invite-state-badge.tsx`
(+ test), `features/members/components/member-profile-page.tsx` (+ test).

**Test first.** The hook test drops the `requestPasswordReset` mock entirely and asserts: calls
`issueMemberInvite` with `{ memberId }`, returns the new `InviteResult`, and still invalidates
`memberKeys.all` on `settled` (keep that assertion — its comment explains a real regression). The
profile test drops the mock at lines 79–96 and asserts: the badge renders per state, the button
label comes from `inviteActionLabel`, the copy dialog shows the assembled URL and the expiry,
re-issue shows the "el anterior fue revocado" title, and a refusal renders
`refusalMessage`. Keep `key={member.id}` and the `blocked`-as-prop shape.

**Does.** Renames the hook; `InviteResult` loses `emailSent`/`fallbackLink`/`mailError`; the badge
component; `InviteAccess` rewired.

**Verify.** `pnpm --filter backstage exec vitest run src/features/members/hooks src/features/members/components/invite-state-badge.test.tsx src/features/members/components/member-profile-page.test.tsx`

---

## Step 11 — backstage: drawer, row menu, members table

**Files (6):** `features/members/components/member-invite-drawer.tsx` (+ test),
`member-row-menu.tsx` (+ test), `routes/_app.members.tsx`, and the members table column.

**Test first.** Drawer: the `DoneState` mail branches are gone; the done screen shows the link +
copy button + expiry, and the `blockedByCargo` / `refusalMessage` branches survive unchanged. Row
menu: the label comes from `inviteActionLabel(memberInviteState(member, now))`, and the
`canProvisionLogin && !provisionBlocked` gate is unchanged. Table: the "Acceso" column renders the
badge.

**Verify.** `pnpm --filter backstage exec vitest run src/features/members`

---

## Step 12 — backstage: the redemption page

**Files (5):** `routes/_auth.invitacion.tsx`, `features/auth/components/invite-redeem-form.tsx`
(+ test), `features/auth/types/set-password-schema.ts` (git-mv of `reset-schema.ts`),
`features/auth/hooks/use-invite.ts` or inline TanStack Query in the form.

**Test first.** Four phases, guardrail #3 explicitly: **loading** ("Validando el enlace…"),
**error** (each `InviteBlockReason` renders its own Spanish copy; unknown/network renders the
generic one with a retry), **valid** (shows the name and the full email, the checklist, both
password fields, mismatch validation), **done** ("Contraseña creada" + a link to `/login`). Plus:
submitting a weak password never calls `redeemInvite`; a `redeemInvite` failure shows the tagged
message and leaves the form usable.

**Does.** The route file exports **only `Route`** — `docs/performance.md:133`. It reads the token
with `useLocation({ select: (l) => l.hash })`. The form reuses `AuthScreen`, `BrandSide`
(`tone="blue"`), `PasswordChecklist` and `setPasswordSchema`; errors go through
`features/auth/lib/invite-error.ts`.

**Verify.** `pnpm --filter backstage exec vitest run src/features/auth/components/invite-redeem-form.test.tsx`

---

## Step 13 — Delete the Firebase-mail surface

**Files (10):** delete `routes/_auth.forgot-password.tsx`,
`features/auth/components/forgot-password-form.tsx` + `.test.tsx`,
`lib/auth/request-password-reset.ts`, `routes/_auth.reset.tsx`,
`features/auth/components/reset-password-form.tsx` + `.test.tsx`,
`lib/auth/confirm-password-reset.ts`; edit `features/auth/components/login-form.tsx` (+ test) and
`components/nav-config.test.ts`.

**Test first.** `nav-config.test.ts:25` → `AUTH_ROUTES = ["/login", "/invitacion"]`. It asserts
`CONTENT_ROUTES == NAV_PATHS ∪ AUTH_ROUTES`, so it goes red until both the deletion and the new
route exist. `login-form.test.tsx:45` asserts the `/forgot-password` link is **gone** and the new
copy is present.

**Does.** The deletions plus the login-page copy change. `routeTree.gen.ts` regenerates on the next
build — do not hand-edit it.

**Verify.** `pnpm --filter backstage exec vitest run && pnpm knip` — knip must report zero unused
exports/files for backstage.

---

## Step 14 — Docs

**Files (5):** `docs/architecture.md:77`, `docs/features.md:24`, `docs/firebase-setup.md:427`,
`docs/roadmap.md` (FX6 at :216, G4 at :227), `docs/performance.md` (record the measured delta).

**Verify.** `pnpm format`

---

## Final verification

Run in order; every one must pass before the PR.

```bash
pnpm lint
pnpm typecheck

pnpm --filter @luminova/types test
pnpm --filter backstage test
pnpm --filter beacon ci                        # eslint + tsc + vitest + test:emulator

# Firestore rules suite — Firestore emulator on port 4010, project demo-rules-test,
# behind tools/scripts/with-emulator-lock.sh + with-emulator-boot-retry.sh
pnpm --filter @luminova/firestore-rules-tests test

pnpm knip
pnpm format

# Bundle. Budget: backstage eager JS <= 162 kB gz (tools/scripts/check-bundle-budget.sh);
# #225 measured 160. Record the BEFORE number from main, then:
pnpm --filter backstage build
bash tools/scripts/check-bundle-budget.sh
for f in apps/backstage/dist/assets/index-*.js; do echo "$f $(gzip -c "$f" | wc -c)"; done
# Dispatch Agent(bundle-budget-watcher) and paste the index-chunk gz delta into the PR.

pnpm pr-tests
```

## Review routing

```bash
.claude/hooks/route.sh
```

Do not guess the set — run it. For this diff (`apps/beacon/**`, `firestore.rules`,
`apps/backstage/src/routes/_auth*`, `.tsx` files, new routes) `.claude/review-routing.json` mandates:

| Token | Gate |
|---|---|
| `security-review` | **hard** — `review-gate.sh` blocks `gh pr create` without a fresh trailer |
| `firestore-security-reviewer` | advisory |
| `firebase-functions-reviewer` | advisory |
| `code-review` | advisory (user-invocation-only — ask, or run an equivalent adversarial pass and say which) |
| `simplify` | advisory |
| `react-best-practices` | advisory |
| `bundle-budget-watcher` | advisory |

`secure-dep-vetting` is **exempt**: this change adds no dependency (`crypto` is Node core). State
that in the PR rather than claiming the skill ran.

Trailer key is `Reviews:` (`.claude/review-routing.json` → `trailerKey`), in the commit message's
last paragraph. Mirror it under a `## Reviews` heading in the PR body.
