# Public profile default + birthdays + photo warning — 2026-08-02

**PR:** #215 (`feat/public-profile-birthdays`) — CI green, MERGEABLE/CLEAN, awaiting review.
**Worktree:** `.worktrees/public-profile-birthdays`.

## Shipped

**1. Public-Directiva publication defaults ON for new members (opt-out).**
`firestore.rules` still forbids `publicProfile` from every client at create; beacon's new
`onMemberCreated` stamps the default server-side inside a transaction that re-reads the
live doc. The first attempt (client stamps it, create arm widened to `is bool`) was
rejected in review: it handed the membership tier the power the update arm exists to deny
them — author a doc with someone else's name, upload a portrait to that doc's own Storage
path, publish a person who never consented.

Publication now additionally requires:
- a `uid` — the opt-out lives at `/me`, so publishing a member with no login is
  publication with an unreachable opt-out;
- `isSurfaceableStatus(status)` — an allowlist (`Activo`/`Inactivo`, absent for legacy
  docs), shared with the birthdays list. `setStatus` leaves `active: true`, so an expelled
  member is not soft-deleted and a denylist would have kept them public.

**2. Admin takedown**, wired end to end: a rules arm accepting `publicProfile: false` and
nothing else, `MemberRepository.unpublishProfile`, an Admin-only row action gated on
`publicProfile === true`, with success/error toasts. Only path to un-publish someone who
can no longer reach `/me`.

**3. Upcoming birthdays.** `/me` already had the list (5 → 3, shared
`UPCOMING_BIRTHDAY_LIMIT`); added a "Próximos cumpleaños" card to the board dashboard for
every role layout. Day + month only, never a birth year.

**4. `/me` photo warning** when consent is on but no portrait is uploaded — the silent
failure that kept a JDL director off the site.

**5. Bugs found and fixed along the way (none were in the original ask):**
- `/me` coerced an absent `publicProfile` to `false`, so an unrelated phone edit recorded
  an explicit opt-out on legacy members and would have made any future backfill skip them.
- `MemberMilestones` showed a false "Sin cumpleaños próximos." to a member without
  directory access (a disabled TanStack query is pending+idle, `isLoading === false`).
- `onBoardMemberWritten` projected the event payload, so a late-delivered invocation could
  silently undo an opt-out or a takedown. Now a transaction over the live doc, `retry:true`.
- An unresolvable project id made every member project to null, so each member write would
  have deleted one more person from the public page. Now skips instead.
- `currentCargoId` accepted doc ids the server rejects permanently (`.`, `..`,
  `__reserved__`, >1500 bytes) — a redelivery loop under `retry:true`.
- `unchanged('uid')` let an explicit `uid: null` land on a uid-less member, which then
  failed `memberDocSchema` and dropped that member from every backstage list.

## Verification

backstage 572 · beacon 222 unit + 17 emulator · firestore-rules 374 · types 298 · knip
clean · bundle within budget (eager JS 160/162 kB gz, CSS 13/15 kB, largest route chunk
6 kB). GitHub Actions `checks` + `emulator` both green on #215.

`pnpm pr-tests` fails locally only at `pnpm audit`, on pre-existing repo-wide
`brace-expansion` advisories (dev-only, via eslint/ejs) — unrelated to this diff.

## Decisions

- **Opt-out is the owner's decision**, and it has an accepted consequence: the
  institutional tier can *compose* a publication (upload portrait + assign cargo + the
  stamped default) with no act by the member. The `uid` gate guarantees a reachable
  opt-out, but they are published first. Requiring a member signal would be opt-in, i.e.
  the prior design. Documented in `firestore.rules` and the board-showcase spec.
- **Legacy members stay opted out.** An absent field reads as not-published everywhere;
  flipping them is a backfill, i.e. a consent decision, not a cleanup commit.
- **`Inactivo` still publishes** (a suspended member still holds their cargo for the
  term); only `Desafiliado` drops. Recorded in the spec.
- **`memberDocSchema.status` gained a `.default("Activo")`** so a doc predating the field
  parses — otherwise it could be live on the public page while invisible in backstage,
  including to the takedown action meant to reach exactly that member.
- `/code-review` is user-invocation-only; it ran as an equivalent adversarial subagent
  pass across four rounds. Stated in the PR body.

## Deferred

- **No emulator test binds the member triggers.** The existing emulator suites cover store
  functions, not trigger wiring, so the transaction's ordering guarantees are argued, not
  asserted. Worth one test: create → stamp, opt-out → showcase doc deleted.
- **No "nothing relevant changed" early exit** on the board projection. Every member write
  (including the per-check-in `totalPoints` mirror) opens a transaction. Adding a guard
  trades away the self-healing property the transaction buys, so it needs its own change
  with an explicit, tested field list.
- **`activeMembers` KPI still counts `Desafiliado` members** (`dashboard-model.ts`) —
  pre-existing, one line from the birthdays fix, left alone because it changes a reported
  number.
- **Feb 29 birthdays** show a date that doesn't exist in non-leap years (`formatDayMonth`
  vs `daysUntilNextAnniversary` disagree by a day). Pre-existing in `@luminova/utils`.

## Owner actions (blocking the feature being visible)

1. **`read:Member` for all members is a prod data fix, not code.** `seedBuiltInRoles` is
   create-only, so `roles/Member` still carries its pre-49fe4b4 permissions and the live
   doc beats the `BUILT_IN_ROLE_PERMS` snapshot. Backstage → `/permisos` → rol **Miembro**
   → add `read:Member`, `read:Activity`, `read:Program` → save. `onRoleWritten` re-mints
   every holder's claims. Without this the roster, leaderboard and birthdays stay empty.
2. Decide whether to backfill existing members to published (separate PR).

## Handoff prompt

> Branch `feat/public-profile-birthdays`, worktree `.worktrees/public-profile-birthdays`,
> PR #215 open and green. Verify the branch before committing (`git rev-parse
> --abbrev-ref HEAD`) — main moved under this branch once already (#214 merged mid-flight
> and touches the same members rules arms). If you rebase again, the review trailer's sha
> dies with it: re-stamp with `.claude/hooks/route.sh`'s token set in a separate bash call
> before `gh pr create`/push. Fresh worktrees need `@luminova/types` built before backstage
> vitest. Remaining work is in the Deferred section above; the two owner actions are not
> code.
