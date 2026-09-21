# Plan — invite-link onboarding

Spec: `docs/specs/invite-link-onboarding.md`. Both documents have been through a fact-check pass
(every file:line citation verified against the worktree) and an adversarial design review; their
decisions are settled. TDD throughout: every step's test is written and seen failing before the
implementation. Checkpoint-commit each step; no step touches >10 files.

## Blocking / owner ops — read first

| # | Op | Blocks? | Notes |
|---|---|---|---|
| 1 | **Revert the Password-reset custom action URL** to the Firebase default | **Yes, at release** | `docs/firebase-setup.md:456-458` currently points Authentication → Templates → Password reset → "Customize action URL" at `https://<backstage-host>/reset`, which step 13b deletes. Without the revert, a console-issued reset mail links to a 404 and operator note 1's second escape hatch is broken. Step 14 rewrites that doc section to match. |
| 2 | **No IAM grant is required.** | — | A positive outcome of choosing Q1(a). If anyone revisits Q1(b), `roles/iam.serviceAccountTokenCreator` on `953870918238-compute@developer.gserviceaccount.com` becomes a hard blocker. (Note: that grant's prior pain is operator knowledge, not recorded anywhere in this repo.) |
| 3 | **No composite index is required.** | — | Revocation is a keyed write via `members/{id}.invite.tokenHash`. `memberId` is stored on the invite doc so a break-glass sweep is *possible*, but it is not a designed path and would need an index. |
| 4 | **Firestore TTL policy** on `memberInvites.purgeAt` | **No** — cleanup only | Owner-op, after the first deploy: `gcloud firestore fields ttls update purgeAt --collection-group=memberInvites --enable-ttl --project=jci-oriente`. Expiry is code-enforced; without this the collection just grows. |
| 5 | **GCP budget alert** | **No** — recommended | Two unauthenticated callables with App Check off. The cheapest real cost signal available before G4. |
| 6 | **App Check keys (roadmap G4)** | **No** | Not required. Listed so it is not mistaken for a blocker. Add `redeemInvite` / `describeInvite` to the G4 checklist as the first functions to flip. |
| 7 | **Deploy ordering** | **Yes, at release** | `pnpm deploy:rules` → `pnpm deploy:functions` → `pnpm deploy:hosting`. `provisionMemberLogin` disappears; a stale tab 404s until it reloads (`Cache-Control: no-cache` on `**`, so one navigation). |
| 8 | **Firebase Console** | **No** | Do **not** disable the Email/Password provider — sign-in depends on it. |

## Two environment notes that will otherwise cost an hour

- **Stop `pnpm dev` before steps 7 and 8.** The rules suite runs `firebase emulators:exec`, which
  binds Firestore on **4010** from the root `firebase.json`. `FIRESTORE_EMULATOR_PORT` moves only the
  test *client*, and `with-emulator-lock.sh` serializes only runs launched through the lock — a dev
  emulator already holding 4010 will still collide.
- **Rebuild `@luminova/types` after step 1.** Steps 2 and 9–13 run backstage vitest against the new
  `./password-policy` subpath, `InviteBlockReason` and `Member.invite`. A stale `types` dist breaking
  app vitest has bitten this repo twice.

---

## Step 1 — Shared contracts in `@luminova/types`

**Files (9):** `packages/types/src/invite-block-reason.ts`, `invite-block-reason.test.ts`,
`member-invite.ts`, `password-policy.ts`, `password-policy.test.ts`, `src/index.ts`, `src/member.ts`,
`src/member-doc-schema.ts`, `packages/types/package.json`.

**Test first.** `invite-block-reason.test.ts`: the union array is non-empty and duplicate-free.
`password-policy.test.ts`: the rule table — length, lowercase, uppercase, digit — accepts and rejects
the expected inputs.

**Does.** `INVITE_BLOCK_REASONS` + `InviteBlockReason` (the ten reasons in the spec, plus
`invite-member-now-privileged` and `invite-account-disabled`). `MemberInviteProjection`,
`InviteState` (`never | legacy | pending | used | expired | revoked | failed`), `INVITE_TTL_MS`,
`INVITE_PURGE_MS`. A zod-free `password-policy.ts` exporting `PASSWORD_RULE_IDS` and
`passwordPolicyViolations(value)`, as the `./password-policy` subpath alongside `./engine` /
`./permission` / `./role-definition`. Adds `privileged-account-requires-admin` and
`account-disabled-requires-admin` to `PROVISION_BLOCK_REASONS`. Adds optional
`invite?: MemberInviteProjection` to `Member` and to `memberDocSchema`.

**Verify.** `pnpm --filter @luminova/types test && pnpm --filter @luminova/types typecheck && pnpm --filter @luminova/types build`

---

## Step 2 — Rewire backstage's password policy onto the shared predicates

**Files (2):** `apps/backstage/src/features/auth/types/password-policy.ts`, its test.

**Test first.** The existing `password-policy.test.ts` must still pass unchanged — it is the
regression net for the extraction.

**Does.** `PASSWORD_RULES` keeps the Spanish labels and the `id`s but takes its `test` predicates
from `@luminova/types/password-policy`. `passwordSchema` unchanged. Guardrail #1: one definition of
the policy, two consumers (the checklist and beacon).

**Verify.** `pnpm --filter backstage exec vitest run src/features/auth/types/password-policy.test.ts`

---

## Step 3 — beacon: extract the pure guards

**Files (3):** `apps/beacon/src/invite-guards.ts`, `invite-guards.test.ts`,
`apps/beacon/src/provision-member-login.ts`.

Three files, not two: `hasDirectGrants` and `readCargoIds` are **module-private** today, so this step
must also rewrite their two call sites in `provision-member-login.ts` to import from the new module.
Copying instead of moving would leave a duplicate (guardrail #1) and moving without rewiring breaks
typecheck, which `pre-commit.sh` will block.

**Test first.** These functions have no direct unit tests today — the fail-closed cases run through
`provisionMember` (`provision-member-login.test.ts:280-426`). So this step **writes new direct
tests** and leaves those integration cases where they are. Cover: non-array `roleIds`, array-shaped
`permissionOverrides`, `""` cargoId, `isSafeDocId`-rejected cargoId, future-term seats. Then
`accountIsPrivileged` against **every** shape in the spec's table — `undefined`, `{}`, `{roles:[]}`,
`{roles:["Member"]}`, `{roles:["Member","Scanner"]}`, `{roles:["Member","Admin"]}`, `{roles:"Admin"}`,
`{perms:[]}`, `{perms:["update:Showcase"]}`, `{perms:{}}` — asserting **absent ≠ malformed**: absent
is not privileged, malformed is.

**Does.** Moves both predicates, adds `accountIsPrivileged(claims)`, and declares `ADOPTABLE_ROLES`
and `NON_PRIVILEGED_ROLES` as **two separate constants** with a test asserting their present equality
(spec: they answer different questions and must be free to diverge). **Type-only cross-package
imports** — this module is imported by `tests/firestore-rules/`, which cannot resolve
`@luminova/types` at runtime. It will need `isSafeDocId` from `./firestore-util.js`; that file is
type-import-only too, but **verify it actually resolves under `tests/firestore-rules/` before step 8
depends on it.**

**Verify.** `pnpm --filter beacon exec vitest run src/invite-guards.test.ts && pnpm --filter beacon typecheck`

---

## Step 4 — beacon: the token module

**Files (2):** `apps/beacon/src/invite-token.ts`, `invite-token.test.ts`.

**Test first.** `mintInviteToken()` returns a 43-char base64url token and a 64-char lowercase-hex
hash; two calls never collide; `hashInviteToken(token)` is deterministic and equals the minted hash;
`isSafeTokenHash` accepts a real hash and rejects `""`, `"a/b"`, `"__x__"`, uppercase, and anything
not 64 hex chars (so a forged token can never build a weird doc path — the `isSafeDocId` discipline).

**Does.** `crypto.randomBytes(32).toString("base64url")` and
`crypto.createHash("sha256").update(token).digest("hex")`. Node core only; no new dependency.

**Verify.** `pnpm --filter beacon exec vitest run src/invite-token.test.ts`

---

## Step 5 — beacon: `issueMemberInvite` (replaces `provisionMemberLogin`)

**Files (8):** `apps/beacon/src/issue-member-invite.ts` (git-mv of `provision-member-login.ts`),
`issue-member-invite.test.ts` (git-mv of its test), `provision-deps.ts`, `provision-deps.test.ts`,
`provision-errors.ts`, `apps/beacon/src/index.ts`, `apps/beacon/CLAUDE.md`,
`tools/scripts/e2e-provision-member.mjs`.

That last file is easy to miss: it hardcodes
`http://127.0.0.1:4020/<project>/us-central1/provisionMemberLogin` and asserts `actionLink` in its
pass condition. It is wired into no `package.json` and no CI, so it will not fail the build — it will
rot silently. Update the endpoint and the assertions.

**Test first.** Extend the moved suite:
- every `actionLink` assertion deleted; the return is `{ email, token, expiresAt, replacedPreviousLink }`;
- adoption branch still refuses a delegate (`reprovision-requires-admin`) — existing cases survive verbatim;
- **new:** recovery branch (`linkedUid !== null && user.uid === linkedUid`) *succeeds* for a delegate
  on a grant-free, unseated, unprivileged member;
- **new:** the self-heal quadrant (`user === null && linkedUid !== null`, i.e. the linked Auth account
  was deleted out of band) refuses a delegate with `reprovision-requires-admin`. **This is the
  regression the two-branch split would have introduced — it must have its own test;**
- **new:** recovery refuses on each of — power cargo any term, `hasDirectGrants`,
  `accountIsPrivileged` (`privileged-account-requires-admin`), `user.disabled`
  (`account-disabled-requires-admin`), `active !== true`;
- **new:** both email-rewrite attacks from the spec land on `linked-to-different-login`;
- **new:** minting writes `memberInvites/{hash}` with every field including `memberId` and
  `issuedByAdmin`, and projects `members/{id}.invite`;
- **new:** **all three writes are one batch** — assert a single `batch.commit()`, and that a
  projection-write failure commits nothing. This is the C2 guarantee; without the test it is prose;
- **new:** re-issue sets the prior doc to `revoked` with `revokedBy` and returns
  `replacedPreviousLink: true`; a first issue returns `false`;
- **new:** the returned token never appears in any `console.*` argument.

**Does.** Renames the callable and module; replaces the single adoption guard with the **exhaustive
three-way switch** on `(user, linkedUid)` from the spec; deletes `ProvisionDeps.passwordResetLink`
and its `auth.generatePasswordResetLink` adapter; adds `revokeInvite` / `writeInvite` /
`projectInvite` deps committed as one batch; adds the new reasons; updates `index.ts` and
`apps/beacon/CLAUDE.md`.

**Verify.** `pnpm --filter beacon exec vitest run src/issue-member-invite.test.ts src/provision-deps.test.ts`

---

## Step 6 — beacon: `describeInvite` + `redeemInvite`

**Files (4):** `apps/beacon/src/redeem-invite.ts`, `redeem-invite.test.ts`,
`apps/beacon/src/index.ts`, `apps/beacon/CLAUDE.md`.

**Test first.**
- `describeInvite` on a valid pending token returns `{ email, name, expiresAt }` and does **not**
  mutate the doc;
- unknown → `invite-invalid`; expired → `invite-expired`; used → `invite-used`; revoked → `invite-revoked`;
- member absent / inactive / email changed / uid changed → the four tags from Q8;
- **mixed-case email fixture:** invite snapshots `Ana@JCI.bo`, member doc holds `ana@jci.bo` → the
  invite **redeems successfully**. Without normalized comparison every mixed-case address is dead on
  arrival, and it surfaces as the generic "no longer valid";
- **the three privilege guards re-run at redemption:** a member who was grant-free at issue but is
  seated on a power cargo / has direct grants / has a privileged claim by redemption →
  `invite-member-now-privileged`. And the exemption: an invite with `issuedByAdmin: true` redeems
  regardless;
- `user.disabled` at redemption → `invite-account-disabled`;
- policy-violating password → `invite-password-weak`, and the token is **still pending** (policy is
  checked before the claim, so a typo does not burn the link);
- happy path: the transaction flips `pending → used` with `usedAt`, the projection updates, and
  `auth.updateUser` is called exactly once with the invite's **pinned** uid;
- a second redeem with the same token → `invite-used`;
- `updateUser` rejects → the invite goes to **`status: "failed"`** (not `used`), the thrown reason is
  `invite-update-failed`, and `console.error` was called;
- **no `console.*` argument contains the token or the password.**

**Does.** One shared `loadInvite(db, tokenHash, now)` so the two callables cannot drift. Both declared
`onCall({ enforceAppCheck: false, maxInstances: 10, timeoutSeconds: <short>, memory: <small> }, …)`
with a comment naming roadmap G4. `redeemInvite` claims the token in a `runTransaction` **before**
`updateUser`. Structured log `{ fn, memberId, tokenPrefix, outcome }` and nothing else.

**Verify.** `pnpm --filter beacon exec vitest run src/redeem-invite.test.ts` then `pnpm --filter beacon ci`

---

## Step 7 — `firestore.rules` + rules tests

**Files (4):** `firestore.rules`, `tests/firestore-rules/rules.test.ts`,
`tests/firestore-rules/rules-coverage.test.ts`, `docs/data-models.md`.

**Test first (all three go red before the rules change).**
1. `rules-coverage.test.ts` — add `memberInvites` to `KNOWN_UNSURFACED` with its reason.
2. `rules.test.ts` — add `{ name: "memberInvites", path: "memberInvites/h1" }` to `DELETE_DENIED`.
3. `rules.test.ts` — deny cases: no principal (Admin, `manage:Member`, self lane, positions lane) may
   set `invite` on create or touch it on update; no principal may read/create/update/delete
   `memberInvites/h1`.

**Does.** Adds `match /memberInvites/{tokenHash} { allow read, write: if false; }`; adds
`&& !touched('invite')` to `memberWriteInvariants()` (beside `!touched('uid')`, firestore.rules:308)
and `&& !('invite' in request.resource.data)` to the members create arm (firestore.rules:492-493 —
that arm uses targeted negative checks, not `keys().hasOnly()`, so `invite` is not already denied);
documents the collection in `docs/data-models.md`.

**Parser constraint — the drift test depends on it.** `parseDeleteDeniedCollections`
(`tools/scripts/lib/rules-delete-denied.mjs`) is line-based: the `allow` must be on **one line** in
the form `allow read, write: if false;`, sitting directly under its own `match` line with no nested
`match` in between (a nested `match` resets the parser's current collection).

**Verify.** `pnpm --filter @luminova/firestore-rules-tests test` (stop `pnpm dev` first — see the
environment note).

---

## Step 8 — Guard-parity test

**Files (1):** `tests/firestore-rules/invite-guard-parity.test.ts`.

**Test first — it *is* the deliverable.** Imports `memberProvisionBlocked` from backstage's
`provision-gate.ts` and the predicates from `apps/beacon/src/invite-guards.ts` (type-only across the
package boundary, as `cargo-assignment-parity.test.ts` does with `assignable-cargo-core.ts`). Over a
fixture table of (principal × member shape × cargo), asserts `clientOffersInvite ⟹ beaconGuardsAllow`.

**It must also assert non-vacuity.** The implication is trivially true when the client offers
nothing — which is exactly the failure mode this test exists to catch. So add: **the offered set is
non-empty for the D3 principal** (a `create:MemberLogin` delegate against a provisioned, grant-free,
unseated member). Without that assertion the suite goes green while proving nothing.

A header comment names the conjuncts it deliberately does **not** cover — the adoption branch, the
self-heal branch, and `accountIsPrivileged`, all of which depend on Auth-directory state the client
cannot see.

**Verify.** `pnpm --filter @luminova/firestore-rules-tests test`

---

## Step 9 — backstage: shared libs + the client gate

**Files (10):** `apps/backstage/src/lib/callable-refusal.ts` (+ test),
`features/members/lib/invite-state.ts` (+ test), `features/members/lib/invite-link.ts` (+ test),
`features/auth/lib/invite-error.ts` (+ test), `features/members/lib/provision-error.ts`,
`features/members/lib/provision-gate.ts` (+ test).

**`provision-gate.ts` is the C1 fix and it is not optional.** `memberProvisionBlocked` blocks on
`hasLogin: member.uid != null`, which is a **mount** gate in `member-row-menu.tsx:61`. Without this
change beacon allows recovery and the UI never offers it — D3 ships as dead code. **Only the
`hasLogin` conjunct moves**; the power-seat and direct-grants half stays exactly as it is.

**Test first.** `provision-gate.test.ts`: a provisioned, grant-free, unseated member is **offered**
to a `create:MemberLogin` delegate; a power-seated or directly-granted one is still blocked.
`invite-state.test.ts`: all seven states, including `pending` past `expiresAt` → `expired` with no
stored flag, and `member.uid && !member.invite` → `legacy` (the whole existing roster).
`invite-link.test.ts`: `inviteLink("abc", "https://x.test")` → `"https://x.test/invitacion#abc"`.
`invite-error.test.ts`: iterate `INVITE_BLOCK_REASONS` and assert every one has a message;
`refusalMessage` returns `null` for `"toString"` / `"constructor"` (the prototype-pollution case
`provision-error.ts` documents).

**Does.** Extracts `refusalMessage(err, table)` into `lib/callable-refusal.ts` (the prototype-safety
comment moves with it) and rewrites `provision-error.ts` on top of it — guardrail #1, second
occurrence. `invite-link.ts` stays a pure string builder with **no** `@luminova/firebase` import, so
it cannot drag the SDK eager.

**Verify.** `pnpm --filter backstage exec vitest run src/lib/callable-refusal.test.ts src/features/members/lib src/features/auth/lib`

---

## Step 10 — backstage: hook + badge + profile surface

**Files (6):** `features/members/hooks/use-issue-member-invite.ts` (git-mv of
`use-provision-member-login.ts`) + test, `features/members/components/invite-state-badge.tsx` +
test, `features/members/components/member-profile-page.tsx` + test.

**Test first.** Hook: drop the `requestPasswordReset` mock (lines 11–17) entirely; assert it calls
`issueMemberInvite` with `{ memberId }`, returns the new `InviteResult`, and **still invalidates
`memberKeys.all` on `settled`** (keep that assertion — its comment documents a real regression).
Profile: drop the mock at lines 79–96; assert the badge per state, the button label from
`inviteActionLabel`, the copy dialog showing the assembled URL and expiry, the "el anterior fue
revocado" title when `replacedPreviousLink`, and `refusalMessage` on a tagged refusal. **Keep
`key={member.id}` and the `blocked`-as-prop-not-mount-gate shape** — both comments in that file
explain regressions that recur if removed.

**Does.** Renames the hook; `InviteResult` loses `emailSent`/`fallbackLink`/`mailError`; adds the
badge; rewires `InviteAccess`.

**Verify.** `pnpm --filter backstage exec vitest run src/features/members/hooks src/features/members/components/invite-state-badge.test.tsx src/features/members/components/member-profile-page.test.tsx`

---

## Step 11 — backstage: drawer, row menu, members table

**Files (6):** `member-invite-drawer.tsx` + test, `member-row-menu.tsx` + test,
`routes/_app.members.tsx`, the members table column.

**Test first.** Drawer: `DoneState` mail branches gone; the done screen shows link + copy + expiry;
`blockedByCargo` / `refusalMessage` branches survive (including the "Detalle: AppCheck token is
invalid" case at lines 454/467, which becomes the generic-error case). Row menu: label from
`inviteActionLabel(memberInviteState(member, now))` — note its current strings are "Reenviar
invitación" / "Invitar a la app", different from the profile page's. Table: the "Acceso" column
renders the badge.

**Verify.** `pnpm --filter backstage exec vitest run src/features/members`

---

## Step 12 — backstage: the redemption page

**Files (5):** `routes/invitacion.tsx`, `features/auth/components/invite-redeem-form.tsx` + test,
`features/auth/types/set-password-schema.ts` (git-mv of `reset-schema.ts`), `src/routeTree.gen.ts`.

**The route is top-level — `routes/invitacion.tsx`, NOT `_auth.invitacion.tsx`.** `_auth.tsx:4-9`
bounces any authenticated visitor to `/`, which would leave the operator unable to verify the link
they just produced — the only check available now that no mail exists.

**Test first.** Four phases, guardrail #3 explicitly: **loading** ("Validando el enlace…"), **error**
(each `InviteBlockReason` gets its own Spanish copy; unknown/network gets the generic one with a
retry), **valid** (name, full unmasked email, checklist, both password fields, mismatch validation),
**done** ("Contraseña creada" + a link to `/login`). Plus: a weak password never calls
`redeemInvite`; a failure shows the tagged message and leaves the form usable; on success
`history.replaceState` clears the fragment.

**Does.** The route file exports **only `Route`** (`docs/performance.md:133` — a stray second export
disables auto-code-splitting and drags the route's imports eager). Reads the token with
`useLocation({ select: (l) => l.hash })`. Reuses `AuthScreen`, `BrandSide` (`tone="blue"`),
`PasswordChecklist`, `setPasswordSchema`; errors via `features/auth/lib/invite-error.ts`.

**Verify.** `pnpm --filter backstage build && pnpm --filter backstage exec vitest run src/features/auth/components/invite-redeem-form.test.tsx`

The build is **required, not optional**: `routeTree.gen.ts` is generated by `tanstackRouter` in
`vite.config.ts`, which vitest does not run (`vitest.config.ts` declares only `react()`). Without a
build the generated tree never learns about the new route.

---

## Step 13a — Register `/invitacion` in the nav allowlist

**Files (3):** `apps/backstage/src/components/nav-config.test.ts`, `src/routeTree.gen.ts`,
`features/auth/components/login-form.tsx`.

**Test first.** `nav-config.test.ts:25` → `AUTH_ROUTES = ["/login", "/forgot-password", "/reset", "/invitacion"]`
(the deletions come in 13b). That list is a plain allowlist filtered against every `fullPath:` in the
generated tree — layout position is irrelevant, so a top-level `/invitacion` belongs there exactly as
an `_auth` child would. It exempts the path from both the set-equality assertion (line 46) and the
nav-gate assertion.

**Does.** The allowlist entry, plus the login-page copy change: `login-form.tsx:78`'s
`<Link to="/forgot-password">` becomes non-link copy — *"¿Olvidaste tu contraseña? Pídele a la
directiva que te envíe un enlace de acceso."* The existing CEL footnote stays and is now the real
escape hatch.

**Verify.** `pnpm --filter backstage build && pnpm --filter backstage exec vitest run src/components/nav-config.test.ts src/features/auth/components/login-form.test.tsx`

---

## Step 13b — Delete the Firebase-mail surface

**Files (10):** delete `routes/_auth.forgot-password.tsx`,
`features/auth/components/forgot-password-form.tsx` + `.test.tsx`,
`lib/auth/request-password-reset.ts`, `routes/_auth.reset.tsx`,
`features/auth/components/reset-password-form.tsx` + `.test.tsx`,
`lib/auth/confirm-password-reset.ts`; edit `components/nav-config.test.ts` and regenerate
`src/routeTree.gen.ts`.

Split from 13a deliberately. `routeTree.gen.ts` **imports** the deleted route modules, so a single
combined step leaves the repo untypecheckable at its midpoint and `pre-commit.sh` blocks the
checkpoint commit.

**Test first.** `AUTH_ROUTES` → `["/login", "/invitacion"]`. Set equality fails in both directions
until the routes are gone *and* the tree is regenerated.

**Does.** The seven deletions. `request-password-reset.ts`'s only consumers are
`forgot-password-form.tsx` and the old hook, both already gone.

**Verify.** `pnpm --filter backstage build && pnpm --filter backstage exec vitest run && pnpm knip`
— knip must report zero unused exports/files for backstage.

---

## Step 14 — Docs

**Files (6):** `docs/architecture.md:77`, `docs/features.md:24`, `docs/firebase-setup.md` (**both**
`:427` and `:456-458` — the latter is the custom action URL, blocking-op #1), `docs/roadmap.md`
(FX6 at :216, G4 at :227), `docs/performance.md` (record the measured delta), `docs/data-models.md`.

**Not edited:** `docs/plans/*`, `docs/superpowers/*`, `docs/specs/2026-06-*`. They are a historical
record; rewriting them to match today erases why this document exists.

**Verify.** `pnpm format`

---

## Final verification

```bash
pnpm lint
pnpm typecheck

pnpm --filter @luminova/types test
pnpm --filter backstage test
pnpm --filter beacon ci                        # eslint + tsc + vitest + test:emulator

# Stop `pnpm dev` first — emulators:exec binds Firestore on 4010 from firebase.json.
pnpm --filter @luminova/firestore-rules-tests test

pnpm knip
pnpm format                                    # prettier --check

# Bundle. Budget: backstage eager JS <= 162 kB gz (tools/scripts/check-bundle-budget.sh:106);
# #225 measured 160. Capture the BEFORE number from a scratch build of the base commit.
pnpm --filter backstage build
bash tools/scripts/check-bundle-budget.sh
for f in apps/backstage/dist/assets/index-*.js; do echo "$f $(gzip -c "$f" | wc -c)"; done
# Dispatch Agent(bundle-budget-watcher) and put the index-chunk gz delta in the PR.

pnpm pr-tests
```

## Review routing

```bash
.claude/hooks/route.sh
```

Run it; do not guess. For this diff (`apps/beacon/**`, `firestore.rules`, new routes, `.tsx` edits)
`.claude/review-routing.json` mandates:

| Token | Gate |
|---|---|
| `security-review` | **hard** — `review-gate.sh` blocks `gh pr create` without a fresh trailer |
| `firestore-security-reviewer` | advisory |
| `firebase-functions-reviewer` | advisory |
| `code-review` | advisory (user-invocation-only — ask the user, or run an equivalent adversarial pass and say which was done) |
| `simplify` | advisory |
| `react-best-practices` | advisory |
| `bundle-budget-watcher` | advisory |

`secure-dep-vetting` is **exempt** — no dependency changes (`crypto` is Node core). State that in the
PR rather than claiming the skill ran.

Stamp the trailer (`Reviews:`) in a **separate bash call before** `gh pr create`, in the commit
message's last paragraph, and mirror it under a `## Reviews` heading in the PR body.
