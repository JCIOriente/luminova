# JCI Oriente — Product Roadmap

Living doc. Each item is a self-contained workstream: brainstorm → plan → TDD →
PR, one at a time or in parallel where dependencies allow. `[P]` = parallel-safe,
`[S]` = sequential (dependency noted).

**Status legend:** ✅ done (merged) · 🟡 partial (a slice shipped, rest deferred) ·
⬜ not started. The `#` column strikes through (`~~A1~~ ✅`) completed items and
notes the merged PR.

_Last synced: 2026-06-10 — §A Recognition Engine complete + fed (F3·A1·A2·A5·A6·A3
all merged to main); B1 member home (#20); E1/E2/E5 widgets (#21); D1 full
Events/Activities CRUD (#22); **A7 roster→participation expansion (#23)** — roster
roles now feed the engine. **Login redesign (#35) + auth hardening (#36)** — remember-me,
password recovery, password policy. **FX batch merged**: dark mode + sidebar collapse (#37),
DataTable/E6 + Members table UX/FX1 (#38), ⌘K command palette E3/FX3 (#39) — @luminova/ui now 31 components.
**First prod deploy SHIPPED (#43, I4)** — both Hosting sites + rules + 5 beacon functions LIVE.
**Members console (#41/#42)** + **B2 role-aware board home (#45)** + **H1 profilePicture upload (#46)**.
Reshaped around the **Recognition Engine** after a product/UX discussion (points,
QR attendance, multi-role access, award submissions)._

## Naming conventions

Identifiers in this doc and the code follow one rule to avoid mixed-language names:

- **Code identifiers** (types, fields, functions, enum *names*) → **English**, no
  diacritics; `PascalCase` types, `camelCase` fields/functions.
- **User-facing enum *values* / labels** → may stay **Spanish** (the product
  language), matching the shipped `MemberStatus` = `"Activo" | "Inactivo" |
  "Desafiliado"`. So `membershipStatus` (English key) holds Spanish values.
- **Expand acronyms** in identifiers for readability: `isExecutiveCommittee`, not
  `isCEL`.
- **`gestión` → `term`** in code (the annual cycle; likely a `Term` entity carrying
  year + board + convention date — points windows and "previous-term" eligibility
  reference it).
- Planned small renames when their feature lands (don't churn shipped code now):
  `member.status` → `membershipStatus` (once `duesStatus` coexists);
  consider `ally.personInCharge` → `contactPerson` (more idiomatic).

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
| **CEL (board)** | all Comité Ejecutivo Local members | Read dashboard for their area; receives **birthday** notifications |
| **Scanner** | designated **per event** | Check-in attendees for the assigned event only |
| **Member** | everyone | Own profile, personal QR, points/history, events; see own dues status |

**Status is two decoupled signals (do not share one field):**
- `membershipStatus` — `Activo / Inactivo / Desafiliado` — lifecycle, owned by Membership/Admin.
- `duesStatus` — derived from the payment ledger: `Al día → Pendiente` (after X overdue days) → a scheduled job flips `membershipStatus → Inactivo` (after Y more days). X/Y configurable; auto-reinstate on payment. Gives honest reporting ("left" vs "non-payment").

## Input artifacts

- ✅ **Points matrix** → `docs/reference/points-matrix.md` — received. It's the
  **"Mejor Miembro Individual"** evaluation (a monthly competition), richer than a
  counter — see "Recognition Engine — rules that shape the model" below.
- ✅ **Dues config (2026)** → `docs/reference/dues-config.md` — received (tiered,
  **per-tier cadence**; 30→Pendiente / 90→Inactivo; JCI-Bolivia obligation).
- ⛔ **JCI award criteria** → `docs/reference/jci-award-criteria.md` — still pending;
  gates the Project schema (C1) + dossier export (C2).

## Recognition Engine — rules that shape the model (from the points matrix)

The points system is the **Mejor Miembro Individual** competition. Design F3/§A to these:

- **Hierarchy Programa → Proyecto → Actividad — `Program` and `Project` are
  DISTINCT entities** (different at their core), each producing **Activities** where
  attendance/points happen. "Actividad" = an execution instance (coordination
  meetings don't count). Roles: director / co-director / team.
- **Points are provisional, then confirmed by two gates** (v1 — the "aval"
  endorsement is **dropped for now**, it's an administrative/legal-advisor step):
  (a) director files the **final report** (conclusions + economic report if budget —
  this *is* the C-epic dossier), and (b) **attendance registered**. Plus a
  **punctuality factor** — ≤15 min after start = 100 %, later = 50 % (from the
  **QR check-in timestamp**). Ledger entry → `provisional | confirmed`, with factor +
  source/role + activity link.
- **Time-windowed:** monthly accrual (1st–last), convention cutoff **3 weeks before**,
  annual total. Leaderboard publishes **monthly (top 3 + Best of Month)** and annually.
- **Public & transparent:** the cumulative + monthly points table is **visible to all
  members** (not gated); monthly public breakdown; members can request clarification.
- **Finance → Points coupling:** only members **al día** are eligible; a **missed
  month voids that month's points** (restored on payment); **joining a payment plan =
  +5 pts**. The engine reads `duesStatus`.
- **Accrual ≠ eligibility:** flags `isExecutiveCommittee` (CEL — can't compete),
  `isPastPresident` (no accrual), `wonBestMemberPreviousTerm` (excluded next term).
  JDL directors *do* accrue + compete. (These may be derived from an award/term
  history rather than stored booleans — decide in the F3 brainstorm.)
- **Tiebreaker:** social media (like 1 / comment 2 / share 3) — **manual monthly entry,
  low-priority** (assess its value when the slice is built).

## Done (baseline)

- Monorepo harness; **Spotlight** (images still placeholders); **@luminova/ui**
  primitives; **@luminova/firebase** + emulator; **firebase.json/.firebaserc**.
- **Backstage**: bootstrap + auth, **Members CRUD**, **Allies CRUD**, **UI uplift**, **role-aware ability gating (F1)**, **Point Rules admin (A1)**, **Member profile (A5)**, **Leaderboard (A6)**, **Activities create + QR check-in (A3)**.
- **Beacon**: **`awardPoints` real engine (A2)** — `checkIns` → `participations` + `memberPoints`; report-confirm triggers; **`setUserRoles` callable + seed bootstrap (F1)**.
- **`@luminova/auth` (F1)**: role contract + CASL ability builder; role-aware `firestore.rules`.
- **`@luminova/types` (F2)**: shared `Member`/`MemberStatus`/`Ally` types + zod schemas; **`/engine` subpath (F3)** — engine model + helpers + `CheckIn`/`checkInSchema` (BUILT package); backstage + beacon consume them.
- **`@luminova/ui`**: primitives + **QR widgets (E4)** (`/qr-code`, `/qr-scanner`) + **Popover (E5) / Combobox (E1) / MultiSelect (E2)** (Radix popover + cmdk).
- **§A Recognition Engine COMPLETE + FED (F3·A1·A2·A5·A6·A3)** — points flow end-to-end; verified by a live functions-emulator e2e.

---

## 0. Foundations (build/design first — the epics lean on these)

| # | Item | Dep | Parallel | Notes / Triggers |
|---|------|-----|----------|------------------|
| ~~F1~~ ✅ | **Roles & permissions** — DONE (PR `feat/roles-permissions`). `@luminova/auth` (roles + CASL ability), role-aware `firestore.rules`, beacon `setUserRoles` callable + seed bootstrap, backstage claim decode + `<Can>` gating. 7 roles incl. **ProjectManager**. Absorbed rules-hardening (follow-up #1). | CASL ✅ | `[S]` | **Deferred:** uid-on-create + member self-login (B1); role UI (D4); functions-deploy packaging |
| ~~F2~~ ✅ | **@luminova/types** — DONE (PR `feat/luminova-types`). BUILT package (emits `dist/`); promoted shipped `Member`/`MemberStatus` + `Ally` types **and** their zod schemas; renamed `ally.personInCharge → contactPerson`; rewired backstage to `@luminova/types`. **Promote-shipped-only** — engine/finance entities (`Program`/`Project`/`Activity`/`Participation`/`PointRule`/`DuesConfig`/`Payment`) deferred to F3/J where their shapes are designed. | — | `[P]` | **Deferred:** engine/finance types (F3/J); `member.status → membershipStatus` (when `duesStatus` lands); beacon-safe subpath export (A2 — `member.ts`/`ally.ts` kept framework-free for it); I1 codegen-drift gate |
| ~~F3~~ ✅ | **Recognition Engine data model** — DONE (#12). **participation ledger** with `provisional\|confirmed` state (gates: final report + attendance) + punctuality factor + month bucket + role/activity link; **distinct Program/Project + Activity** entities; a separate **eligibility** layer (flags) and **Finance→Points** read. In `@luminova/types/engine` (pure subpath). | F2; ✅ matrix | `[S]` design-first | the dependency under everything in §A; richer than "sum of points" |

## A. Recognition Engine (the spine — epic, ship in slices)

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| ~~A1~~ ✅ | **Point Rules** admin (matrix CRUD) — DONE (#13). `/point-rules`: Admin inits the 16 matrix rows per term + edits points inline | F3; matrix | `[S]` | mirrors the points matrix exactly |
| ~~A2~~ ✅ | **`awardPoints` real logic** (beacon) — DONE (#14). `onDocumentWritten('checkIns/{id}')` → derives `participations` + `memberPoints` + mirrors `members.totalPoints`; report-confirm triggers. Real chain e2e'd in A3. | F3, A1 | `[S]` | `firebase-functions-reviewer`; replaced the "not implemented" throw |
| ~~A3~~ ✅ | **Attendance / QR check-in** (mobile-first) — DONE (#18). Admin/PM `/check-in`: scan member QR or manual tap → writes `checkIns` → A2 awards. Live roster. Bundled minimal E4 (QR widgets) + thin D1 (activity create). | F1, F3, B-QR | `[S]` | the day-of mobile flagship; live roster + manual tap fallback |
| A4 ⬜ | **Offline check-in** — queue scans, sync when back online | A3 | `[S]` | roadmap, **not priority** (bad venue wifi is real); A3's `CheckInRepository.create` is the wrap seam |
| ~~A5~~ ✅ | **Member profile / points history** — DONE (#15). `/members/:id` board view: cumulative + byMonth + ParticipationLedger + (A3) personal QR. **Member self-view still pending → B1.** | F3 | `[S]` | makes points "very visible" |
| ~~A6~~ ✅ | **Leaderboard / recognition surface** — DONE (#16). `/leaderboard` public to all members; annual + monthly (top 3 + Best of Month); eligibility flags applied (inert until a board is designated) | F3, A5 | `[S]` | the engagement flywheel; social tiebreak deferred |
| ~~A7~~ ✅ | **Roster → participation auto-expansion** (beacon) — DONE (#23). `onProgramWritten`/`onProjectWritten` → idempotent `processInitiativeWrite` reconciles roster rows (Director/CoDirector/Team, anchored on the initiative id) + re-confirms attendance rows; confirms on report-filed (`monthBucket`=report month), voids on roster removal. Closes trust model #7. | A2, D1 | `[S]` | check-in convention: execution activities tap Attendee; e2e deferred |

## B. Member-facing surface & role-aware home

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| B1 🟡 | **Member home** — DONE core (#20). `/me`: points + rank + **personal QR** + participation ledger; member-only login redirects here. **Deferred:** upcoming-events feed + milestones (birthday/anniversary — we store `birthdate`/`joinDate` and use neither). | F1, A5 | `[S]` | the reason a member opens the app |
| ~~B2~~ ✅ | **Role-aware board home** — DONE (#45). Pure `boardHomeLayout(roles)` orders/hides the Overview widgets per role (Admin full · Membership members-first · Treasury money-first · ProjectManager events/projects-first · ExecutiveCommittee read-only); multi-role = highest-precedence layout + union of visible widgets. Presentation-only (widgets still mocked). **Side effect:** Overview grid → vertical stack (re-grid within each role's order deferred). | F1 | `[S]` | — |

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
| ~~D1~~ ✅ | **Events / Activities CRUD** — DONE (#22). Program + Project CRUD (`/programs`, `/projects`) with roster selects (Combobox/MultiSelect) + status + `fileFinalReport` (flips child points provisional→confirmed); Activity edit/cancel + real program/project **parent picker** (replaces A3's free-text id); `startAt`/`category` lock once check-ins exist. New `programs` rule; `projects` read tightened public→signedIn (resolves G2 for projects). | ~~E1, E2~~ ✅ | `[S]` | upcoming-events feed still ⬜ (D2); roster→participation auto-expansion → A7 |
| D2 | **Reports** | A*, D1 | `[S]` | needs members/events/points data |
| D3 | **Communications** | external email | `[S]` | scope before committing (likely a backend/email integration) |
| D4 | **Settings** page (real) | F1 | `[P]` | profile + theme + org + role mgmt |

## E. @luminova/ui widget gaps

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| ~~E1~~ ✅ | **Combobox** (single-select + search) — DONE (#21). `@luminova/ui` `Combobox` on Radix Popover + cmdk; re-select clears; barrel-exported | — | `[P]` | unblocked Events (D1) |
| ~~E2~~ ✅ | **Multi-select** with search — DONE (#21). `MultiSelect` (same Popover+cmdk body) with removable chips; pure helpers unit-tested | E1 | `[S]` | unblocked Events (D1) |
| ~~E3~~ ✅ | **Command palette** primitive — DONE (#39). `@luminova/ui` `CommandPalette` (cmdk dialog + grouped, fuzzy, keyboard-nav); backs ⌘K (FX3) | E5 | `[P]` | cmdk (added in #21) seeded it |
| ~~E4~~ ✅ | **QR generator + QR scanner** components — DONE (#18, with A3). `@luminova/ui/qr-code` (qrcode.react) + `@luminova/ui/qr-scanner` (@zxing camera), deep-imported for lazy chunking | camera/lib (vet dep) | `[P]` | unblocked A3; mobile camera UX |
| ~~E5~~ ✅ | **Popover** primitive — DONE (#21). `Popover` wraps `@radix-ui/react-popover`, JCI-token styled; backs E1/E2 (and later menus/E3) | — | `[P]` | shared by combobox/menus/command |
| ~~E6~~ 🟡 | **DataTable** — DONE client-side (#38). `@luminova/ui` `DataTable` (search + filter-chips + column sort + skeleton/empty; composes `Table`); adopted on Members (FX1). **Server-side pagination deferred** (> ~1–2k docs); Allies/Events adoption are follow-ups | — | `[P]` | consolidates tables |

## F. UI polish / follow-ons (mostly independent)

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| ~~FX1~~ ✅ | **Table search + filter-chips + column sort** — DONE (#38). Built on the new `DataTable` (E6) and adopted on Members (search over name+email+role, status chips, sortable columns). **Server pagination still deferred** (> ~1–2k docs); Allies/Events adoption follow-ups | E6 | `[P]` | table-stakes UX |
| ~~FX2~~ ✅ | **Dark mode** — DONE (#37). `[data-theme="dark"]` neutral-token override in `@luminova/ui/theme.css` (brand locked); `ThemeController` follows `prefers-color-scheme` + persisted toggle (Claro/Oscuro/Sistema) via shared `ui-prefs` store. Backstage only; a few hardcoded `rgba` shadows don't invert yet | — | `[P]` | spotlight dark mode out of scope |
| ~~FX3~~ ✅ | **⌘K command palette** — DONE (#39). `CommandMenu` wires the E3 `CommandPalette`: ability-filtered nav (from `NAV_GROUPS`) + navigate-only quick actions; topbar ⌘K affordance now real | E3 | `[S]` | — |
| ~~FX4~~ ✅ | **Sidebar collapse** — DONE (#37). 72px icon-rail w/ per-item tooltips, header toggle, `_app` grid driven by the persisted `ui-prefs` `sidebarCollapsed` | — | `[P]` | — |
| FX6 ✅ | **Auth hardening** — DONE. Remember-me → Firebase auth persistence (local/session); branded password recovery (`/forgot-password` enumeration-safe request + `/reset` verify-oobCode → set new password with live requirements checklist); password policy (min 6 + lower/upper/digit) on login **and** reset; blue brand panel + entrance motion for recovery pages; footnote → CEL (`jci.orienteolm@gmail.com`). reCAPTCHA = App Check (see G4, code-complete; keys pending). | — | `[P]` | `/security-review`; spec+plan in `docs/superpowers/` |
| FX5 ✅ | **Login redesign** — DONE. `/login` split-screen (dark brand panel + ripple + "Sé el cambio" / light form card) from Claude Design handoff; reuses `@luminova/ui` (`RippleBackground`, `LogoLockup`, `Button`, `Field`, `Input`, new `Checkbox`; added `lock`/`eye`/`eyeOff` icons). Email/password auth unchanged. SSO omitted; "¿La olvidaste?" + "Recordarme" visual-only (deferred). | — | `[P]` | `react-best-practices`; brand side hides < `lg` |

## G. Security & data hardening (non-role)

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| G1 | **Soft-delete write-guard** — pre-flight existence/`active` check in **both** Member & Ally repos; route `handleSubmit`/`confirmDelete` try/catch | — | `[P]` | `/security-review` + `firestore-security-reviewer` |
| G2 🟡 | Confirm-or-restrict public read on `projects`/`board` — **`projects` restricted to signedIn in D1 (#22)** (D1 added member-id rosters); **`board` still public** (confirm or restrict). C4 will expose curated public project fields, not raw docs. | C1 | `[S]` | `/security-review` |
| G3 | `.env.local.example` real keys → placeholders | — | `[P]` | — |
| G4 🟡 | App Check enforcement ON (after reCAPTCHA keys) — **client code scaffolded** (`@luminova/firebase` inits reCAPTCHA v3 App Check when `VITE_APPCHECK_SITE_KEY` set; debug-token supported). Remaining = infra: provision key, set env, flip enforcement. See `docs/firebase-setup.md`. | infra keys | `[S]` | `/security-review` |

> Note: the bulk of rules hardening moved into **F1** (rules must be role-aware now,
> not just `delete:if false`).

## H. Media / Storage

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| ~~H1~~ ✅ | `profilePicture` upload — DONE (#46). Shared `@luminova/ui` `Avatar` + lazy `ImageUploader` (square-crop via `react-easy-crop`, client downscale 512px/JPEG, ≤5MB) on two surfaces (admin member drawer + member self on `/me`); `@luminova/firebase` `uploadMemberPhoto`/`deleteMemberPhoto` (path `members/{id}/profile.jpg`); scoped `storage.rules` + new `@luminova/storage-rules-tests`. **Fixed a self-upload break:** added owner-only `members` update branch scoped to `profilePicture`. | — | `[P]` | — |
| H2 | Project **evidence gallery** uploads | C1, ~~H1~~ ✅ | `[S]` | award evidence + public showcase |
| H3 | Ally logos (greyscale→color hover) — chains off H1's uploader (`allies/{id}/logo.*`) | ~~H1~~ ✅ | `[S]` | — |
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
| J1 | **Dues config** (year-scoped): named **tiers** `{name, amount, cadence}` (BOB) with **per-tier cadence** (monthly/semestral/yearly; some tiers exempt = 0), the 30/90 lapse thresholds, and the yearly JCI-Bolivia obligation (USD+BOB) | F2; ✅ dues-config | `[S]` | tiers + cadence vary per year; keep history |
| J2 | **Payment ledger** — Treasury records offline payments (date, amount, method, period/year, tier, recordedBy); append-only | J1 | `[S]` | `/security-review` + `firestore-security-reviewer` (Treasury-only writes) |
| J3 | **Member ↔ tier assignment** per year (carry-over default) + derived `duesStatus` | J1, J2 | `[S]` | duesStatus computed, not stored mutable |
| J4 | **Auto-lapse** scheduled function (beacon cron) — overdue computed **per the member's tier cadence**; `Al día → Pendiente (30d) → Inactivo (90d)`; auto-reinstate on payment; fires reminders. Also **voids the lapsed month's points** + awards **+5 for joining a payment plan** (Finance→Points hooks) | J3, A2 | `[S]` | `firebase-functions-reviewer`; audited, reversible |
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
