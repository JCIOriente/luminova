# Presentation & Onboarding Documentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the repo a way *in* — a docs router, rendered diagrams, an onboarding
path, a decision record, a showcase deck (English, engineers) and a business track
(Spanish, Directiva).

**Architecture:** Every artifact is either a *view* onto the existing ~4,000 lines of
docs or one of the two things genuinely absent (onboarding path, decision record).
Nothing restates `data-models.md`, `features.md`, `ci-cd.md` or `firebase-setup.md`;
each new file links to them. Diagrams are Mermaid checked into `docs/diagrams/`, so one
source renders in GitHub, in the deck, and in the business docs.

**Tech Stack:** Markdown, Mermaid (GitHub-native + Artifact-native), Claude Slides
Artifact type for the deck.

**Spec:** `docs/specs/2026-09-20-presentation-docs-design.md`

**Worktree:** `.worktrees/presentation-docs`, branch `chore/presentation-docs`

---

## File Structure

| File | Responsibility | Phase |
|------|---------------|-------|
| `docs/diagrams/container.mmd` | System containers + the client-SDK/Admin-SDK trust boundary | 0 |
| `docs/diagrams/checkin-points.mmd` | Check-in → Recognition Engine → leaderboard sequence | 0 |
| `docs/diagrams/authz.mmd` | roles doc → `perms` claim → CASL → `<Can>` → `firestore.rules` | 0 |
| `docs/diagrams/data-model.mmd` | Firestore ERD; source-of-truth vs public projections | 0 |
| `docs/diagrams/pipeline.mmd` | hooks → review router → gate → Actions → WIF → preview → promote | 0 |
| `docs/README.md` | Task-oriented router into all docs | 0 |
| `docs/architecture.md` | MODIFY — ASCII art replaced by embedded Mermaid | 0 |
| `docs/onboarding.md` | Clone → first green `pnpm pr-tests` → first PR | 1 |
| `CONTRIBUTING.md` | Thin front door pointing at onboarding + README | 1 |
| `docs/decisions/0001..0010-*.md` | One-page ADRs, each citing its source | 2 |
| `docs/decisions/README.md` | ADR index + the sourcing rule | 2 |
| `docs/negocio/*.md` | Six Spanish business docs | B |
| Slides artifact | Showcase deck | 3 |

Diagrams live in their own directory rather than inline in `architecture.md` so the
deck and the business docs can reference the same source file without duplicating it.

---

## Task 1: Diagram directory + container diagram

**Files:**
- Create: `docs/diagrams/container.mmd`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p docs/diagrams
```

- [ ] **Step 2: Write the container diagram**

Facts to encode (sourced from `docs/architecture.md` lines 1-70):
- spotlight → Firebase Hosting target `jcioriente`; reads via `firebase/firestore/lite`
  (`@luminova/firebase/lite`); no Auth, no realtime; reads `siteConfig`, `showcase`,
  `allyShowcase`, `boardShowcase`; performs exactly one write — `leads`.
- backstage → Hosting target `jcioriente-backstage`; full Firebase client SDK; Auth
  required on all `_app.*` routes.
- beacon → Cloud Functions, `nodejs24`, **Admin SDK only** — this is the trust boundary.
- All three share one Firestore database and one Storage bucket
  (`jci-oriente.firebasestorage.app`).

Write `docs/diagrams/container.mmd` as a Mermaid `flowchart TB` with a `subgraph` for
the trusted (Admin SDK) side and one for the untrusted (browser/client SDK) side, and
the Firestore security rules drawn as the membrane between them. Label the spotlight
edge read-only except `leads`.

- [ ] **Step 3: Verify it parses**

```bash
node -e "const s=require('fs').readFileSync('docs/diagrams/container.mmd','utf8'); if(!/^(flowchart|graph|sequenceDiagram|erDiagram)/m.test(s)) throw new Error('no mermaid header'); console.log('ok', s.split('\n').length, 'lines')"
```

Expected: `ok <n> lines`

- [ ] **Step 4: Commit**

Stage `docs/diagrams/container.mmd` and commit with message:
`docs(diagrams): container diagram with the Admin-SDK trust boundary`

---

## Task 2: Check-in → points sequence diagram

**Files:**
- Create: `docs/diagrams/checkin-points.mmd`

- [ ] **Step 1: Write the sequence diagram**

Facts to encode (sourced from `docs/architecture.md` "Data Flow: Point Calculation" and
`docs/data-models.md` lines 265-475):

1. Admin/PM/Scanner registers a check-in in backstage → writes `checkIns/{id}`
2. beacon `awardPoints` trigger fires
3. Reads the activity + `pointRules/{termId__code}`
4. Derives `participations/{activityId__memberId__role}` (engine-written, client
   read-only)
5. Recomputes `memberPoints/{memberId__termId}` **transactionally**
6. Mirrors `members.totalPoints`
7. Backstage leaderboard + member profiles read `memberPoints`

Write as Mermaid `sequenceDiagram` with participants: Scanner (backstage), Firestore,
beacon awardPoints, and a note marking step 5 as transactional — that atomicity is the
point of the diagram (it is the fix from the points-race work).

- [ ] **Step 2: Verify it parses**

```bash
node -e "const s=require('fs').readFileSync('docs/diagrams/checkin-points.mmd','utf8'); if(!/^sequenceDiagram/m.test(s)) throw new Error('not a sequence diagram'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

Stage `docs/diagrams/checkin-points.mmd` and commit with message:
`docs(diagrams): check-in to points sequence`

---

## Task 3: Authorization chain diagram

**Files:**
- Create: `docs/diagrams/authz.mmd`

- [ ] **Step 1: Read the current authz implementation**

```bash
sed -n '1,60p' packages/auth/src/perms.ts
sed -n '1,60p' packages/auth/src/ability.ts
```

Read before writing — the diagram must match the code, not this plan's summary.

- [ ] **Step 2: Write the diagram**

Chain to encode:
`roles/{roleId}` doc (runtime-editable)
→ `onMemberWritten` / `onRoleWritten` beacon triggers
→ `perms` custom claim on the Firebase ID token (**cap 30, fail-closed**)
→ CASL ability built in `@luminova/auth`
→ `<Can>` gates + `useCan` in backstage UI
→ **mirrored** by `firestore.rules` server-side

Draw the mirror relationship explicitly as a bidirectional "must agree" edge between
the CASL ability and `firestore.rules`, annotated with the reason: client gates are UX,
rules are enforcement — a direct write bypasses client code entirely
(`docs/engineering-guardrails.md` #2).

- [ ] **Step 3: Verify it parses**

```bash
node -e "const s=require('fs').readFileSync('docs/diagrams/authz.mmd','utf8'); if(!/^(flowchart|graph)/m.test(s)) throw new Error('no mermaid header'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

Stage `docs/diagrams/authz.mmd` and commit with message:
`docs(diagrams): authorization chain and the rules mirror`

---

## Task 4: Firestore ERD

**Files:**
- Create: `docs/diagrams/data-model.mmd`

- [ ] **Step 1: Confirm the collection list from the rules**

```bash
grep -oE "match /[a-zA-Z]+/" firestore.rules | sort -u
```

Expected 19 collections plus `databases` (the rules wrapper, not a collection —
exclude it): activities, allies, allyShowcase, boardShowcase, checkIns, leads,
memberPoints, members, notifications, participations, pointRules, positions, programs,
projects, pushTokens, roles, showcase, siteConfig, terms.

- [ ] **Step 2: Write the ERD**

Mermaid `erDiagram`. Group into tiers and say so in a comment at the top of the file,
since `erDiagram` has no subgraph support:

- **Source of truth (admin-written):** members, positions, terms, programs, projects,
  activities, pointRules, allies, roles, siteConfig, checkIns, leads
- **Engine-written (client read-only):** participations, memberPoints
- **Public projections (world-read, beacon-written):** showcase, allyShowcase,
  boardShowcase
- **Per-user:** notifications, pushTokens (keyed by auth UID)

Encode only the relationships, not every field — `docs/data-models.md` owns the fields.
Include the composite-key documents explicitly, since they are the non-obvious part:
`memberPoints/{memberId__termId}`, `participations/{activityId__memberId__role}`,
`pointRules/{termId__code}`.

- [ ] **Step 3: Verify it parses and covers every collection**

```bash
node -e "
const s=require('fs').readFileSync('docs/diagrams/data-model.mmd','utf8');
if(!/^erDiagram/m.test(s)) throw new Error('not an ER diagram');
const want=['members','positions','terms','programs','projects','activities','pointRules','allies','roles','siteConfig','checkIns','leads','participations','memberPoints','showcase','allyShowcase','boardShowcase','notifications','pushTokens'];
const missing=want.filter(c=>!s.includes(c));
if(missing.length) throw new Error('missing: '+missing.join(', '));
console.log('ok — all', want.length, 'collections present');
"
```

Expected: `ok — all 19 collections present`

- [ ] **Step 4: Commit**

Stage `docs/diagrams/data-model.mmd` and commit with message:
`docs(diagrams): Firestore ERD with projection tiers`

---

## Task 5: Delivery pipeline diagram

**Files:**
- Create: `docs/diagrams/pipeline.mmd`

- [ ] **Step 1: Write the diagram**

Facts to encode (sourced from `docs/ci-cd.md` sections 1-3 and the CLAUDE.md Tooling
Index hooks table):

Local: `branch-guard.sh` (hard-blocks commits on main) → `pre-commit.sh` (fmt + lint +
typecheck) → `review-gate.sh` (hard-blocks `gh pr create` without a fresh review
trailer) → `review-router.sh` (prints the mandated review set).

CI (`ci.yml`): checks (build · lint · typecheck · test · bundle-budget · audit) +
emulator (Firestore/Storage rules + beacon race guards).

CD (`deploy.yml`), on CI success on main: filter (which surfaces changed) → **reviewer
approval on the GitHub `production` environment** → deploy-rules → deploy-functions →
deploy-hosting (preview → smoke → promote).

Annotate the three design pillars that make this unusual: **keyless** (WIF/OIDC, no
long-lived key exists anywhere), **human-gated** (one-click approval, no unattended
production change), **least blast radius** (only the changed surface deploys, in the
order data-contract → backend → UI).

- [ ] **Step 2: Verify it parses**

```bash
node -e "const s=require('fs').readFileSync('docs/diagrams/pipeline.mmd','utf8'); if(!/^(flowchart|graph)/m.test(s)) throw new Error('no mermaid header'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

Stage `docs/diagrams/pipeline.mmd` and commit with message:
`docs(diagrams): local-hooks-to-production delivery pipeline`

---

## Task 6: Embed diagrams into architecture.md

**Files:**
- Modify: `docs/architecture.md` (replace the ASCII block at lines 5-31 and the
  "Data Flow: Point Calculation" ASCII block)

- [ ] **Step 1: Inline the container diagram**

Replace the ASCII art system-overview block with a fenced ` ```mermaid ` block
containing the contents of `docs/diagrams/container.mmd`, followed by the line:

```markdown
_Source: [`docs/diagrams/container.mmd`](diagrams/container.mmd)_
```

GitHub renders fenced `mermaid` blocks natively. The `.mmd` file stays the editable
source; `architecture.md` carries a copy for readers.

- [ ] **Step 2: Inline the sequence diagram**

Replace the "Data Flow: Point Calculation" ASCII block the same way, using
`docs/diagrams/checkin-points.mmd`, with the same source-link line.

- [ ] **Step 3: Add the remaining three diagrams**

Add an `## Authorization`, `## Data Model` and `## Delivery Pipeline` section, each with
the fenced mermaid block and its source link.

- [ ] **Step 4: Verify no ASCII art remains**

```bash
grep -n '┌\|└\|│\|─' docs/architecture.md || echo "ok — no box-drawing characters left"
```

Expected: `ok — no box-drawing characters left`

- [ ] **Step 5: Verify every diagram is embedded**

```bash
node -e "
const s=require('fs').readFileSync('docs/architecture.md','utf8');
const want=['container.mmd','checkin-points.mmd','authz.mmd','data-model.mmd','pipeline.mmd'];
const missing=want.filter(f=>!s.includes(f));
if(missing.length) throw new Error('not linked: '+missing.join(', '));
const blocks=(s.match(/\`\`\`mermaid/g)||[]).length;
if(blocks<5) throw new Error('expected >=5 mermaid blocks, found '+blocks);
console.log('ok —', blocks, 'mermaid blocks, all sources linked');
"
```

Expected: `ok — 5 mermaid blocks, all sources linked`

- [ ] **Step 6: Commit**

Stage `docs/architecture.md` and commit with message:
`docs(architecture): replace ASCII art with rendered Mermaid diagrams`

---

## Task 7: The docs router

**Files:**
- Create: `docs/README.md`

- [ ] **Step 1: Inventory what must be routed to**

```bash
ls docs/*.md && ls docs/specs | wc -l && ls docs/plans | wc -l && ls docs/status | wc -l
```

- [ ] **Step 2: Write the router**

Structure — **task-oriented, not a table of contents**. Open with a one-paragraph
orientation ("three apps, five packages, one Firebase project"), then a table whose
left column is a goal in the reader's words:

| I want to… | Start here | Then |
|---|---|---|
| Understand the system | `architecture.md` | `data-models.md` |
| Make my first contribution | `onboarding.md` | `CONTRIBUTING.md` |
| Add an admin screen | `features.md` | `reuse-first-ui.md`, the `backstage-feature-scaffold` skill |
| Change Firestore data | `data-models.md` | `engineering-guardrails.md` #2 (rules mirror code) |
| Touch auth or permissions | `diagrams/authz.mmd` | `firestore.rules`, the `firestore-security-reviewer` subagent |
| Work on Cloud Functions | `architecture.md` beacon section | the `firebase-functions-reviewer` subagent |
| Deploy or debug a deploy | `ci-cd.md` | `firebase-setup.md` |
| Keep the site fast | `performance.md` | the `bundle-budget-watcher` subagent |
| Know why something is the way it is | `decisions/` | `specs/` |
| Explain this to a non-engineer | `negocio/resumen.md` | `negocio/impacto.md` |

Follow with a short "Directory map" section explaining what `specs/` vs `plans/` vs
`status/` each hold and when to add to them (from the CLAUDE.md Docs-layout rule).

Do **not** summarize the contents of the linked docs. The router's only job is to route.

- [ ] **Step 3: Verify every link resolves**

```bash
node -e "
const fs=require('fs'),path=require('path');
const s=fs.readFileSync('docs/README.md','utf8');
const links=[...s.matchAll(/\]\(([^)#]+)(#[^)]*)?\)/g)].map(m=>m[1]).filter(l=>!/^https?:/.test(l));
const bad=links.filter(l=>!fs.existsSync(path.resolve('docs',l)));
if(bad.length) throw new Error('broken links: '+bad.join(', '));
console.log('ok —', links.length, 'relative links all resolve');
"
```

Expected: `ok — <n> relative links all resolve`

Note: links to `onboarding.md`, `CONTRIBUTING.md`, `decisions/` and `negocio/` will fail
until Tasks 8-10 land. Re-run this check at Task 12 Step 1 and treat failures before
then as expected.

- [ ] **Step 4: Commit**

Stage `docs/README.md` and commit with message:
`docs: add task-oriented router into the documentation set`

---

## Task 8: Onboarding guide — **CANCELLED, do not execute**

`CONTRIBUTING.md` and `README.md` already cover every step below, and more accurately:
the Java 21+ emulator requirement, the `.env.local.example` files that ship filled in,
`pnpm turbo run build --filter="./packages/*"` as the fresh-worktree build, and the fact
that `branch-guard.sh` only fires inside a Claude Code session rather than for every
contributor. A draft was written and deleted before commit.

See the cancellation note in the spec. The remainder of this task is kept only so the
record shows what was proposed and why it was dropped.

<details>
<summary>Original Task 8 (not to be executed)</summary>

**Files:**
- Create: `docs/onboarding.md`
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Verify the setup steps by reading the authoritative sources**

```bash
cat .nvmrc
node -e "const p=require('./package.json'); console.log(p.engines, p.packageManager)"
grep -n 'emulator\|port' firebase.json | head -20
```

The guide must state the versions these commands print, not versions from memory.

- [ ] **Step 2: Write the guide**

Sections, in the order a newcomer needs them:

1. **What this is** — three apps, five packages, one Firebase project. Two sentences,
   then link to `architecture.md`.
2. **Prerequisites** — Node from `.nvmrc`, pnpm from `packageManager`, `firebase-tools`,
   `gh`.
3. **First run** — `pnpm install`, `.env.local` per app (the variable list from
   CLAUDE.md), `firebase emulators:start`, the emulator port table, and
   `VITE_FIREBASE_EMULATOR_ENABLED=true`.
4. **The first-run trap** — in a fresh worktree, `@luminova/types`, `@luminova/auth` and
   `@luminova/utils` must be **built** before app vitest will run. State the symptom
   (module-resolution failures in tests) and the fix (`pnpm build` at the root first).
   This is the single most likely thing to stall a new contributor.
5. **Making a change** — worktree-first (`git worktree add .worktrees/<slug> -b <branch> main`,
   never edit the primary checkout), branch prefixes `feat/ fix/ chore/ migration/`,
   Conventional Commits with module scope.
6. **Before the PR** — run `.claude/hooks/route.sh` to compute the mandated review set,
   run every review it lists, stamp the trailer on a commit in range (last paragraph —
   git trailer parsing), mirror it under `## Reviews` in the PR body, then
   `gh pr create` and `pnpm pr-tests`.
7. **What will block you** — `branch-guard.sh` hard-blocks commits on main;
   `review-gate.sh` hard-blocks `gh pr create` without a fresh review trailer. Explain
   these are guards, not bugs, and how to satisfy each.
8. **Where to ask** — link `docs/README.md`.

- [ ] **Step 3: Write CONTRIBUTING.md**

Thin. Repo name and one-line purpose, a "Start here" link to `docs/onboarding.md`, a
"Find your way around" link to `docs/README.md`, and the four branch prefixes. Do not
duplicate the onboarding content — GitHub surfaces `CONTRIBUTING.md` in the PR UI, so
its job is to redirect, not to teach.

- [ ] **Step 4: Verify the stated versions match reality**

```bash
node -e "
const fs=require('fs');
const g=fs.readFileSync('docs/onboarding.md','utf8');
const nvmrc=fs.readFileSync('.nvmrc','utf8').trim().replace(/^v/,'');
const major=nvmrc.split('.')[0];
if(!g.includes(major)) throw new Error('onboarding does not mention Node '+major);
const pm=require('./package.json').packageManager;
if(pm && !g.includes(pm.split('@')[0])) throw new Error('onboarding does not mention the package manager');
console.log('ok — Node', major, 'and', pm, 'both referenced');
"
```

Expected: `ok — Node <major> and <pm> both referenced`

- [ ] **Step 5: Commit**

Stage `docs/onboarding.md` and `CONTRIBUTING.md` and commit with message:
`docs: add onboarding guide and contributing front door`

</details>

---

## Task 9: ADR log

**Files:**
- Create: `docs/decisions/README.md`
- Create: `docs/decisions/0001-firestore-over-relational.md` … `0010-worktree-first-and-computed-review-routing.md`

- [ ] **Step 1: Find the source for each decision before writing any ADR**

```bash
ls docs/specs docs/status
git log --oneline -80
```

**Binding sourcing rule:** every ADR cites the spec, status handoff, or PR it was
derived from. Where the record does not preserve the rationale, the ADR states
"Rationale not recorded — reconstructed from the implementation" and says what the code
shows. Never invent a motivation.

- [ ] **Step 2: Write the ADR template into the index**

`docs/decisions/README.md` holds: the sourcing rule verbatim, the numbering convention,
a one-line-per-ADR index table, and this template:

```markdown
# NNNN. <Title>

**Status:** Accepted | Superseded by NNNN
**Date:** YYYY-MM-DD
**Source:** <path to spec/status doc, or PR link, or "not recorded">

## Context
<the forces at play — what made this a decision rather than a default>

## Decision
<what was chosen>

## Consequences
<what this makes easy, what it makes hard, what it rules out>
```

- [ ] **Step 3: Write the ten ADRs**

One file each, one page each:

| # | Slug | Likely source |
|---|------|--------------|
| 0001 | `firestore-over-relational` | `docs/architecture.md`, `docs/data-models.md` |
| 0002 | `turborepo-pnpm-monorepo` | root `package.json`, `docs/specs/2026-06-05-firebase-tooling-setup-design.md` |
| 0003 | `three-deployables` | `docs/architecture.md` |
| 0004 | `lite-sdk-for-spotlight` | `docs/specs/2026-06-22-spotlight-fast-page-load-design.md`, `docs/performance.md` |
| 0005 | `perms-custom-claim` | `docs/specs/builtin-role-set.md`, `docs/specs/role-lifecycle.md` |
| 0006 | `casl-for-abilities` | `packages/auth/src/ability.ts`, `docs/status/2026-07-20-authz-migration.md` |
| 0007 | `bespoke-ui-package` | `docs/reuse-first-ui.md`, `packages/ui/DESIGN.md` |
| 0008 | `server-side-public-projections` | `docs/specs/2026-06-21-public-allies-design.md`, `docs/specs/2026-07-23-board-showcase-design.md` |
| 0009 | `keyless-deploy-via-wif` | `docs/ci-cd.md` sections 4 and 6 |
| 0010 | `worktree-first-and-computed-review-routing` | `CLAUDE.md`, `.claude/review-routing.json`, `docs/status/2026-06-12-feature-flow-harness.md` |

Confirm each source exists before citing it; if a listed source is absent, find the real
one or mark the rationale unrecorded.

- [ ] **Step 4: Verify every ADR cites a source that exists**

```bash
node -e "
const fs=require('fs'),path=require('path');
const dir='docs/decisions';
const adrs=fs.readdirSync(dir).filter(f=>/^\d{4}-/.test(f));
if(adrs.length!==10) throw new Error('expected 10 ADRs, found '+adrs.length);
let unrecorded=0;
for(const f of adrs){
  const s=fs.readFileSync(path.join(dir,f),'utf8');
  const m=s.match(/^\*\*Source:\*\*\s*(.+)$/m);
  if(!m) throw new Error(f+': no Source line');
  const src=m[1].trim();
  if(/not recorded/i.test(src)){unrecorded++;continue;}
  const refs=[...src.matchAll(/\`([^\`]+)\`|\[[^\]]*\]\(([^)]+)\)/g)].map(x=>x[1]||x[2]).filter(r=>!/^https?:/.test(r));
  for(const r of refs){ if(!fs.existsSync(r)) throw new Error(f+': cited source missing -> '+r); }
}
console.log('ok — 10 ADRs, all cited paths exist,', unrecorded, 'marked rationale-not-recorded');
"
```

Expected: `ok — 10 ADRs, all cited paths exist, <n> marked rationale-not-recorded`

- [ ] **Step 5: Commit**

Stage `docs/decisions` and commit with message:
`docs(decisions): add sourced ADR log for the ten architectural calls`

---

## Task 10: Business track (Spanish)

**Files:**
- Create: `docs/negocio/capacidades-por-rol.md`, `impacto.md`,
  `manual-administracion.md`, `costos-y-continuidad.md`

All four in **Spanish**. No code identifiers in prose except where naming a screen the
reader will see. No PR numbers.

**Re-scoped 2026-09-20.** `resumen.md` and `hoja-de-ruta.md` were **dropped** —
`README.es.md` already covers "El problema", "Cómo funciona", "Características" and
"Hoja de ruta" in Spanish. Read `README.es.md` in full before writing any of the four
below, and link to it rather than restating it.

- [ ] **Step 2: `capacidades-por-rol.md`**

A table: role down the side, capability across. Derive the real capability set from
`packages/auth/src/built-in-perms.ts` and the `/permisos` screen — not from assumption:

```bash
sed -n '1,80p' packages/auth/src/built-in-perms.ts
```

State explicitly that roles are runtime-editable in `/permisos`, so the table is a
snapshot of the seeded defaults, not a hard-coded truth.

- [ ] **Step 3: `impacto.md`** — the buy-in document

What the chapter can now report upward, and where each number comes from:
- Participation per member per term — the participation ledger
- Recognition points — the Recognition Engine, computed automatically from check-ins
- Activity and program history with photos — the public `/impacto` page
- Public Directiva page and ally wall
- Inbound contacts — the leads capture on the public site

Describe **only shipped behaviour.** Anything not yet live belongs in `hoja-de-ruta.md`.

- [ ] **Step 4: `manual-administracion.md`**

Numbered, non-technical procedures: invite a member, register attendance with QR
check-in, edit the public site's content, publish an ally, review incoming contacts.
Each step gets a screenshot slot in the exact form `<!-- SCREENSHOT: descripción -->`
so the slots are greppable for a later capture pass.

- [ ] **Step 6: `costos-y-continuidad.md`**

From `docs/ci-cd.md` section 10, which states the pipeline cost is effectively $0
(public repo → free Actions; WIF/STS free; preview channels auto-expire in 1 day), with
the only recurring cost being gen2 function container images in Artifact Registry, and
the only real billing risk being a runaway gen2 trigger loop.

What is **not** in the repo — Firebase plan and actual monthly spend — goes in a clearly
marked block:

```markdown
> **Datos pendientes.** Requiere acceso a la consola de facturación de Firebase:
> plan actual (Spark/Blaze), gasto mensual de los últimos 3 meses, y si existe una
> alerta de presupuesto configurada en el proyecto `jci-oriente`.
```

Then the continuity half, which *is* knowable: who can deploy (the GitHub `production`
environment reviewers), that no long-lived deploy key exists anywhere, where secrets
live, and the recommended one-time caps from `ci-cd.md` section 10 (Artifact Registry
cleanup policy, GCP budget alert).

- [ ] **Step 7: Verify the screenshot slots and the pending-data block**

```bash
node -e "
const fs=require('fs');
const slots=fs.readFileSync('docs/negocio/manual-administracion.md','utf8').match(/<!-- SCREENSHOT:/g)||[];
if(slots.length<5) throw new Error('expected >=5 screenshot slots, found '+slots.length);
const c=fs.readFileSync('docs/negocio/costos-y-continuidad.md','utf8');
if(!/Datos pendientes/.test(c)) throw new Error('cost doc missing the pending-data block');
console.log('ok —', slots.length, 'screenshot slots, pending-data block present');
"
```

Expected: `ok — <n> screenshot slots, pending-data block present`

- [ ] **Step 8: Commit**

Stage `docs/negocio` and commit with message:
`docs(negocio): business documentation set in Spanish`

---

## Task 11: Showcase deck

**Files:**
- Slides Artifact (no repo file; the deck lives as a published Artifact)

- [ ] **Step 1: Check for an existing design system to build on**

Call the Artifact tool with `action: "list"` and `type: "Design System"`.

If the organization has a published design system, use it for the deck's typography and
palette. If some are listed but none is marked default, do not guess — ask.

- [ ] **Step 2: Create the deck from the Slides type**

Publish with the Slides `type_url`
(`https://claude.ai/artifact/8jTsAFQMFDb2oA8MsPJ2eL`), title
"Luminova — Engineering", no files, and `auto_open: "after_first_write"`. The result
carries the type's own filling instructions; follow those, not this plan's guesses about
its format.

- [ ] **Step 3: Build the spine**

1. The problem — an annually-rotating volunteer board running on spreadsheets
2. Three surfaces, three audiences (container diagram)
3. The Recognition Engine — the flagship flow (sequence diagram)
4. Authorization — claim → CASL → rules mirror (authz diagram)
5. **The practices story** — computed review routing, the shell-enforced PR gate,
   reviewer subagents. *This is the differentiated material; the React/Firebase stack is
   not.*
6. Delivery — keyless, human-gated, least blast radius (pipeline diagram)
7. What rotation-proofing actually required

Reuse the Phase 0 `.mmd` sources directly — Artifacts render Mermaid natively, so no
re-drawing.

- [ ] **Step 4: Verify the deck opens and every diagram renders**

Open the published URL and confirm all four diagrams render rather than showing raw
source. Report the URL to the user.

---

## Task 12: Final verification and PR

- [ ] **Step 1: Re-run the router link check now that all targets exist**

```bash
node -e "
const fs=require('fs'),path=require('path');
const s=fs.readFileSync('docs/README.md','utf8');
const links=[...s.matchAll(/\]\(([^)#]+)(#[^)]*)?\)/g)].map(m=>m[1]).filter(l=>!/^https?:/.test(l));
const bad=links.filter(l=>!fs.existsSync(path.resolve('docs',l)));
if(bad.length) throw new Error('broken links: '+bad.join(', '));
console.log('ok —', links.length, 'relative links all resolve');
"
```

Expected: `ok — <n> relative links all resolve` — with **zero** failures this time.

- [ ] **Step 2: Check every markdown file on this branch for broken relative links**

Collect the file list in the shell (not from inside node), then check it:

```bash
find docs CONTRIBUTING.md -name '*.md' -type f > /tmp/md-files.txt
node -e "
const fs=require('fs'),path=require('path');
const files=fs.readFileSync('/tmp/md-files.txt','utf8').split('\n').filter(Boolean);
const bad=[];
for(const f of files){
  const s=fs.readFileSync(f,'utf8');
  for(const m of s.matchAll(/\]\(([^)#]+)(#[^)]*)?\)/g)){
    const l=m[1]; if(/^https?:/.test(l)) continue;
    if(!fs.existsSync(path.resolve(path.dirname(f),l))) bad.push(f+' -> '+l);
  }
}
if(bad.length) throw new Error('broken:\n'+bad.join('\n'));
console.log('ok —', files.length, 'markdown files, no broken relative links');
"
```

Expected: `ok — <n> markdown files, no broken relative links`

- [ ] **Step 3: Run the review router — do not guess the review set**

```bash
.claude/hooks/route.sh
```

Run every review it prints, ENFORCED and REQUIRED alike. If it returns `lighter` or
`minor`, follow the exception terms it prints verbatim.

- [ ] **Step 4: Stamp the review evidence**

Copy the stamp command the router printed. The trailer must sit in the commit message's
**last** paragraph, sharing it with `Co-Authored-By` — git trailer parsing only reads
the final paragraph.

Run this as its own bash call, separate from the PR creation.

- [ ] **Step 5: Open the PR**

Use `gh pr create` with title
`docs: presentation, onboarding and business documentation` and a body file following
the CLAUDE.md template, with the `## Reviews` section listing exactly the tokens the
router mandated.

- [ ] **Step 6: Run the PR test suite**

```bash
pnpm pr-tests
```

Note: `pnpm pr-tests` is known to fail at `pnpm audit` on pre-existing repo-wide
brace-expansion advisories. That failure is not caused by this branch; confirm the
failure is *only* that, and report it as pre-existing rather than fixing it here.

---

## Notes for the executor

- **Docs-only branch.** No source code changes, so no TDD cycle — verification is link
  integrity, diagram parsing, and factual agreement with the sources.
- **Check facts against the repo, never against this plan.** Where a step summarizes a
  source file, the step tells you to read that file first. The plan's summary is a
  pointer, not the authority.
- **Checkpoint per task**, as written. No batch exceeds 10 files.
- **Task 7's link check will fail until Task 10.** That is expected; Task 12 Step 1 is
  where it must pass clean.
