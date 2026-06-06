# JCI Oriente — Product Roadmap

Living doc. Each item is a self-contained workstream: brainstorm → plan → TDD →
PR, one at a time or in parallel where dependencies allow. `[P]` = parallel-safe,
`[S]` = sequential (dependency noted).

_Last synced: 2026-06-06 — reshaped around the **Recognition Engine** after a
product/UX discussion (points, QR attendance, multi-role access, award submissions)._

## Strategic frame

The product's job isn't "CRUD records" — it's **run the membership loop
(Recruit → Engage → Recognize → Retain) with little time, and survive the annual
board handover.** The spine is a **participation → points → recognition engine**:
members earn points for participation (attending activities/events/ceremonies,
directing or being on a project team), points drive recognition + retention.
Access is **multi-role (CASL + role-aware rules)**, not board-only (see Personas
below). **Projects** are not rows; they're **award-submission dossiers**
(National/Area/World) *and* public showcase content for Spotlight. Membership
**dues** are the financial backbone — Treasury records offline payments, status
lapses automatically, and money movement is reported — so a **Finance/Treasury
engine** and a cross-cutting **Notifications layer** are first-class, not extras.

## Personas & permissions

A **permission role ≠ a chapter title** (Presidenta is a title; *Admin* is a
permission). A person holds **multiple additive roles**. Model permissions with
CASL on the client and **mirror them in `firestore.rules`** server-side.

| Permission role | Who | Can |
|---|---|---|
| **Admin** | Presidency + one designated Admin (assigned per year) | Everything |
| **Membership** | Membership Director + Co-director | Create members; set **membershipStatus** (active/inactive); receives **birthday** notifications |
| **Treasury** | Tesorería | Record/manage dues & payments; view money reports; receives overdue + monthly-report notifications |
| **CEL (board)** | all Consejo Ejecutivo Local members | Read dashboard for their area; receives **birthday** notifications |
| **Scanner** | designated **per event** | Check-in attendees for the assigned event only |
| **Member** | everyone | Own profile, personal QR, points/history, events; see own dues status |

**Status is two decoupled signals (do not share one field):**
- `membershipStatus` — `Activo / Inactivo / Desafiliado` — lifecycle, owned by Membership/Admin.
- `duesStatus` — derived from the payment ledger: `Al día → Pendiente` (after X overdue days) → a scheduled job flips `membershipStatus → Inactivo` (after Y more days). X/Y configurable; auto-reinstate on payment. Gives honest reporting ("left" vs "non-payment").

## ⛔ Pending input artifacts (gate the engine + projects)

- **Points matrix** → `docs/reference/points-matrix.md` — the source of truth the
  Point Rules + `awardPoints` are built to mirror. (CSV beside it is fine.)
- **JCI award criteria** → `docs/reference/jci-award-criteria.md` — the rubric
  fields per submission level; the Project schema + dossier export are built to match.
- **Dues config (current year)** → `docs/reference/dues-config.md` — tier names +
  amounts (BOB), the X/Y lapse thresholds, and the chapter→JCI-Bolivia obligation
  (USD + BOB). Year-scoped; the Finance epic mirrors it.

## Done (baseline)

- Monorepo harness; **Spotlight** (images still placeholders); **@luminova/ui**
  primitives; **@luminova/firebase** + emulator; **firebase.json/.firebaserc**.
- **Backstage**: bootstrap + auth, **Members CRUD**, **Allies CRUD**, **UI uplift**.
- **Beacon**: `awardPoints` trigger scaffold (throws "not implemented").

---

## 0. Foundations (build/design first — the epics lean on these)

| # | Item | Dep | Parallel | Notes / Triggers |
|---|------|-----|----------|------------------|
| F1 | **Roles & permissions** — CASL abilities + role model. Keep **chapter title (Presidenta…) separate from permission**. Scanner is **event-scoped** (`can('checkIn','Attendance',{eventId})`). | CASL (vet dep) | `[S]` (everything access-gated leans on it) | absorbs the old rules-hardening: `firestore.rules` becomes **role-aware** (mirror CASL server-side; `delete:if false` + field guards). `/security-review` + `firestore-security-reviewer` |
| F2 | **@luminova/types** package — promote `Member`/`Ally`/`Event`/`Project`/`Participation`/`PointRule`/`DuesConfig`/`Payment` so apps **and** beacon share them | — | `[P]` | needed before E-slices + Spotlight project showcase + Finance |
| F3 | **Recognition Engine data model** — design the **participation ledger** `(member, context, role, when) → points`; `totalPoints` = derived aggregate of ledger entries | F2; **points matrix** | `[S]` design-first | the dependency under everything in §A |

## A. Recognition Engine (the spine — epic, ship in slices)

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| A1 | **Point Rules** admin (matrix CRUD) | F3; matrix | `[S]` | mirrors the points matrix exactly |
| A2 | **`awardPoints` real logic** (beacon) — write ledger rows from participation per rules | F3, A1 | `[S]` | `firebase-functions-reviewer`; replaces the "not implemented" throw |
| A3 | **Attendance / QR check-in** (mobile-first) — designated scanners scan members' **personal QR**; records participation → triggers points | F1, F3, B-QR | `[S]` | the day-of mobile flagship; live roster + manual tap fallback |
| A4 | **Offline check-in** — queue scans, sync when back online | A3 | `[S]` | roadmap, **not priority** (bad venue wifi is real) |
| A5 | **Member profile / points history** — board view + member self-view; breakdown by source | F3 | `[S]` | makes points "very visible"; no member view exists today |
| A6 | **Leaderboard / recognition surface** | F3, A5 | `[S]` | the engagement flywheel |

## B. Member-facing surface & role-aware home

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| B1 | **Member home** — points + rank, **personal QR**, participation history, upcoming events, milestones (birthday/anniversary — we store `birthdate`/`joinDate` and use neither) | F1, A5 | `[S]` | the reason a member opens the app |
| B2 | **Role-aware board home** — lead with what that role needs | F1 | `[S]` | Overview already exists; make it role-conditional |

## C. Projects & Recognition Submissions (reframed)

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| C1 | **Rich Project model** — phases (plan/execute/results), budget vs actual, **team + roles** (also feed points), impact/KPIs, SDG tags, evidence gallery, **public projection** (`published` + curated public fields) | F2; award criteria | `[S]` | one model, three consumers (manage / dossier / public) |
| C2 | **Award dossier** assembly + export per level (National/Area/World) against criteria, with a **readiness checklist** | C1; criteria | `[S]` | uniquely-JCI; the chapter's recognition engine |
| C3 | **Recognition calendar** — submission windows, candidate projects, readiness % | C2 | `[S]` | competitive cadence |
| C4 | **Spotlight project showcase** — public site reads the public projection | C1, F2 | `[S]` | reflects "what we do" publicly |

## D. Remaining admin CRUD

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| D1 | **Events CRUD** | E1, E2 | `[S]` | director/co-director/participant selects; ties to attendance (A3) + points + project link; conditional `parentId` for `Activity` |
| D2 | **Reports** | A*, D1 | `[S]` | needs members/events/points data |
| D3 | **Communications** | external email | `[S]` | scope before committing (likely a backend/email integration) |
| D4 | **Settings** page (real) | F1 | `[P]` | profile + theme + org + role mgmt |

## E. @luminova/ui widget gaps

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| E1 | **Combobox** (single-select + search) | — | `[P]` | blocks Events |
| E2 | **Multi-select** with search | E1 | `[S]` | blocks Events |
| E3 | **Command palette** primitive | E5 | `[P]` | blocks ⌘K |
| E4 | **QR generator + QR scanner** components | camera/lib (vet dep) | `[P]` | blocks A3; mobile camera UX |
| E5 | **Popover** primitive | — | `[P]` | shared by combobox/menus/command |
| E6 | **DataTable** (sort/filter/paginate/skeleton) | — | `[P]` | consolidates Members/Allies/Events tables; see F1-table below |

## F. UI polish / follow-ons (mostly independent)

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| FX1 | **Table search + filter-chips + column sort** (client-side, ~hundreds of rows) | E6 or inline | `[P]` | **table-stakes UX** the design already specs (Members chips); currently unwired. **Server pagination deferred** until a collection > ~1–2k docs |
| FX2 | **Dark mode** | — | `[P]` | token override + toggle + persistence; components already dark-ready |
| FX3 | **⌘K command palette** | E3 | `[S]` | topbar affordance already in place |
| FX4 | **Sidebar collapse** | — | `[P]` | structure is collapse-ready |

## G. Security & data hardening (non-role)

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| G1 | **Soft-delete write-guard** — pre-flight existence/`active` check in **both** Member & Ally repos; route `handleSubmit`/`confirmDelete` try/catch | — | `[P]` | `/security-review` + `firestore-security-reviewer` |
| G2 | Confirm-or-restrict public read on `projects`/`board` (now intersects C4's public projection) | C1 | `[S]` | `/security-review` |
| G3 | `.env.local.example` real keys → placeholders | — | `[P]` | — |
| G4 | App Check enforcement ON (after reCAPTCHA keys) | infra keys | `[S]` | `/security-review` |

> Note: the bulk of rules hardening moved into **F1** (rules must be role-aware now,
> not just `delete:if false`).

## H. Media / Storage

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| H1 | `profilePicture` upload (Storage uploader + emulator) | — | `[P]` | members currently `null` |
| H2 | Project **evidence gallery** uploads | C1, H1 | `[S]` | award evidence + public showcase |
| H3 | Ally logos (greyscale→color hover) | H1 | `[S]` | — |
| H4 | Spotlight real images (replace `ImgSlot`) | — | `[P]` | needs real photos |

## I. Infra / deploy / CI

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| I1 | Codegen-drift CI gate for shared `@luminova/types` schemas | F2 | `[S]` | root CLAUDE.md discipline |
| I2 | Java in CI so `firestore-rules-tests` runs | — | `[P]` | unblocks F1's rules tests |
| I3 | Storage wipe (manual Console) | — | `[P]` | pending from rewrite |
| I4 | First prod deploy (hosting + functions) | F1, G* | `[S]` | gate on access + hardening |
| I5 | Bump the 1 moderate Dependabot advisory | — | `[P]` | `secure-dep-vetting` |

## J. Finance & Treasury (membership dues — v1 = record offline, not full accounting)

Two money flows: **dues IN** (members → chapter, the v1 core) and the chapter's
**obligation OUT to JCI Bolivia** (USD + BOB, yearly — tracked as a reference
figure only). Payments are **ledger entries**, mirroring the points engine; member
dues are **BOB**; everything is **year-scoped** because tiers change yearly.

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| J1 | **Dues config** (year-scoped): named **tiers** `{name, amount}` (BOB), the X/Y lapse thresholds, and the yearly JCI-Bolivia obligation (USD+BOB) | F2; dues-config doc | `[S]` | tiers vary per year; keep history |
| J2 | **Payment ledger** — Treasury records offline payments (date, amount, method, period/year, tier, recordedBy); append-only | J1 | `[S]` | `/security-review` + `firestore-security-reviewer` (Treasury-only writes) |
| J3 | **Member ↔ tier assignment** per year (carry-over default) + derived `duesStatus` | J1, J2 | `[S]` | duesStatus computed, not stored mutable |
| J4 | **Auto-lapse** scheduled function (beacon cron) — `Al día → Pendiente → Inactivo` per X/Y thresholds; auto-reinstate on payment; fires reminders | J3, F3-ledger pattern | `[S]` | `firebase-functions-reviewer`; audited, reversible |
| J5 | **Treasury dashboard + monthly money-movement report** — collected vs outstanding by tier/member; export | J2 | `[S]` | export for the board |

## K. Notifications & automation (in-app first; channel-agnostic)

One layer, many triggers: **birthdays** (→ Membership + CEL), **dues reminders**
(→ members), **overdue alerts** (→ Treasury), **monthly reports** (→ Treasury/
Presidency). Start **in-app**, behind an interface so **email → WhatsApp** plug in
later (Bolivia is WhatsApp-first, but its API has real cost — defer to "enough
resources").

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| K1 | **Notification model + in-app center** (channel-agnostic delivery interface) — real data behind the topbar bell + Overview activity feed | F2 | `[P]` | the bell/activity are currently mocked |
| K2 | **Scheduled triggers** (beacon cron): birthday checks, dues reminders/overdue, monthly report | K1, J4 | `[S]` | `firebase-functions-reviewer` |
| K3 | **Email channel** (later) | K1 | `[S]` | plugs into the interface |
| K4 | **WhatsApp channel** (when resources allow) | K1 | `[S]` | WhatsApp Business API |

---

## Sequencing

**The critical path runs through Foundations.** F1 (roles + role-aware rules) and
F2/F3 (types + engine model) unblock the most and can't be designed piecemeal.

1. **Foundation track** — F2 (types) ∥ F1 (roles + role-aware rules). Then F3
   (engine model) **once the points matrix lands**.
2. **Recognition Engine track** (after F3) — A1 Point Rules → A2 awardPoints →
   A5 member profile → A3 QR check-in (needs E4) → A6 leaderboard → B1 member home.
3. **Projects/Submissions track** (after F2 + award criteria) — C1 → C2 → C3, with
   C4 surfacing on Spotlight.
4. **Finance track** (after F1 roles + F2 types + dues-config doc) — J1 → J2 → J3 →
   J4 (auto-lapse) → J5 (reports), with K1/K2 (notifications) riding alongside J4.
5. **Independent / parallel anytime** (no shared files, no gating inputs):
   FX2 dark mode, FX4 sidebar collapse, FX1 table filtering, E1/E5/E6 widgets,
   G1 soft-delete guard, G3 env placeholders, H1 uploads, I5 dependabot.

**Recommended first moves:** drop the three **input artifacts** (points matrix,
award criteria, dues config) into `docs/reference/`, then start **F1 (roles +
role-aware rules)** and **F2 (types)** — the foundation the engine, finance, and
notifications all sit on. In parallel, knock out a couple of §5 independents
(dark mode, soft-delete guard) so there's always shippable progress.

Pick an item → `prompt-refine` → `superpowers:brainstorming` → `writing-plans` →
subagent TDD, branch off `main`.
