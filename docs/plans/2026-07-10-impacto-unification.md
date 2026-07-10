# Impacto Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `/programas` into `/impacto` with one public jargon ("proyectos" umbrella + "Programa anual" exception chip) and one source of truth (`showcase` collection, one fetch per page).

**Architecture:** `apps/spotlight` only — no backend/schema/rules changes. `/impacto` gains a client-derived featured band; `/programas` becomes a redirect stub; nav/home/static copy swept to the vocabulary contract in `docs/specs/2026-07-10-impacto-unification-design.md`. Visual direction comes from claude.ai/design (frontend-design skill) via DesignSync — its tweaks are **binding** on the default markup this plan ships.

**Tech Stack:** React 19, TanStack Router (file-based), vitest + @testing-library/react, plain CSS in `apps/spotlight/src/styles.css` (design tokens), item-12 cached data layer (`use-showcase.ts` — do not modify).

**Branch/worktree:** `feat/impacto-unification` at `.worktrees/impacto-unification`. All commands run from the worktree root. First run: `pnpm install && pnpm turbo build --filter=spotlight` (fresh worktree needs workspace deps' dist).

**Read first:** `docs/specs/2026-07-10-impacto-unification-design.md` (decisions D1–D6, vocabulary rules, full sweep map).

---

### Task 1: Visual design on claude.ai/design (interactive)

**Files:** none in-repo yet — produces the binding visual direction.

- [ ] **Step 1:** Invoke the `frontend-design` skill against claude.ai/design (DesignSync MCP), linked to this repo's design system (`packages/ui/DESIGN.md`). Design brief:
  - Merged `/impacto` page: dark hero (existing `bg-dark` + `RippleBackground` pattern) with model sentence + 2 mini-stats → "Destacados" featured band (visually distinct from archive — e.g. larger cards or accent treatment) → "Todos los proyectos" area-filter + grid.
  - "Programa anual" chip on showcase cards and detail hero: **subordinate to the area chip, never louder**. Teal-accent pill suggested; designer decides.
  - Home featured section header: eyebrow "Proyectos destacados" + count-safe title.
- [ ] **Step 2:** Record the produced screen/tweaks. DesignSync tweaks are **binding**: where they conflict with the default markup/CSS in Tasks 2–5, the design wins. Implement deviations during those tasks, not as a later pass.
- [ ] **Step 3:** If claude.ai/design is unavailable this session, proceed with the plan's default styling and flag "design pass pending" in the PR body — do not silently skip.

### Task 2: "Programa anual" chip on ShowcaseCard

**Files:**
- Modify: `apps/spotlight/src/components/showcase/showcase-card.tsx`
- Modify: `apps/spotlight/src/styles.css` (after the `.showcase-card-area` block, ~line 1056)
- Test: `apps/spotlight/src/components/showcase/showcase-grid.test.tsx`

- [ ] **Step 1: Extend the fixture and write the failing test**

In `showcase-grid.test.tsx`, add an optional `kind` param to `mk` (line 16 — currently hardcodes `kind: "Project"`):

```tsx
const mk = (
  id: string,
  ms: number,
  category: ShowcaseItem["category"],
  kind: ShowcaseItem["kind"] = "Project",
): ShowcaseItem =>
  ({
    id,
    kind,
    // ...rest of the existing object literal unchanged
```

Append to the `describe` block:

```tsx
  it("renders the Programa anual chip only for Program kind", async () => {
    renderWithRouter(
      <ShowcaseGrid
        items={[mk("prog", 2, "DesarrolloIndividual", "Program"), mk("proj", 1, "DesarrolloComunitario")]}
      />,
    );
    expect(await screen.findByText("Programa anual")).toBeInTheDocument();
    expect(screen.getAllByText("Programa anual")).toHaveLength(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter spotlight exec vitest run src/components/showcase/showcase-grid.test.tsx`
Expected: FAIL — "Unable to find an element with the text: Programa anual"

- [ ] **Step 3: Implement the chip**

In `showcase-card.tsx`, replace the lone area span (line 36):

```tsx
        <span className="showcase-card-area">{areaLabel}</span>
```

with:

```tsx
        <span className="showcase-card-area">
          {areaLabel}
          {item.kind === "Program" && <span className="showcase-flag">Programa anual</span>}
        </span>
```

In `styles.css`, immediately after the `.showcase-card-area` rule closes (~line 1056):

```css
  .showcase-flag {
    margin-left: 10px;
    padding: 2px 8px;
    border: 1px solid var(--jci-teal);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--jci-teal);
    white-space: nowrap;
  }
```

(Adjust per Task 1 design tweaks if they specify otherwise.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter spotlight exec vitest run src/components/showcase/showcase-grid.test.tsx`
Expected: PASS (all tests in file)

- [ ] **Step 5: Commit**

```bash
git add apps/spotlight/src/components/showcase/showcase-card.tsx apps/spotlight/src/styles.css apps/spotlight/src/components/showcase/showcase-grid.test.tsx
git commit -m "feat(spotlight): Programa anual chip on showcase cards"
```

### Task 3: Kind-aware detail page (eyebrow + hero chip)

**Files:**
- Modify: `apps/spotlight/src/routes/impacto.$id.tsx`
- Test: `apps/spotlight/src/routes/impacto-detail.test.tsx` (create)

- [ ] **Step 1: Export `DetailContent` for testing**

In `impacto.$id.tsx`, change `function DetailContent(` to `export function DetailContent(` (line 63).

- [ ] **Step 2: Write the failing test**

Create `apps/spotlight/src/routes/impacto-detail.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Timestamp } from "firebase/firestore";
import type { ShowcaseItem } from "@luminova/types/engine";
import { DetailContent } from "./impacto.$id";

const mkItem = (kind: ShowcaseItem["kind"]): ShowcaseItem =>
  ({
    id: "x",
    kind,
    featured: false,
    title: "Titulo X",
    description: "desc",
    category: "DesarrolloComunitario",
    startDate: Timestamp.fromMillis(0),
    endDate: Timestamp.fromMillis(86400000),
    completedAt: Timestamp.fromMillis(86400000),
    impact: { personsImpacted: 10, volunteers: 2, custom: [], closingSummary: "resumen" },
    photos: [],
    team: { director: null, coDirectors: [], members: [] },
  }) as unknown as ShowcaseItem;

function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <>{ui}</>,
  });
  const impactoRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/impacto",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, impactoRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("DetailContent kind awareness", () => {
  it("shows Programa anual chip and El programa eyebrow for Program", async () => {
    renderWithRouter(<DetailContent item={mkItem("Program")} />);
    expect(await screen.findByText("Programa anual")).toBeInTheDocument();
    expect(screen.getByText("El programa")).toBeInTheDocument();
  });
  it("shows El proyecto eyebrow and no chip for Project", async () => {
    renderWithRouter(<DetailContent item={mkItem("Project")} />);
    expect(await screen.findByText("El proyecto")).toBeInTheDocument();
    expect(screen.queryByText("Programa anual")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter spotlight exec vitest run src/routes/impacto-detail.test.tsx`
Expected: FAIL — no "Programa anual", eyebrow is always "El proyecto"

- [ ] **Step 4: Implement**

In `impacto.$id.tsx` `DetailHero`, after the area span (line 55):

```tsx
        <span className="showcase-detail-area">
          {areaLabel}
          {item.kind === "Program" && <span className="showcase-flag">Programa anual</span>}
        </span>
```

In `DetailContent`, replace the hardcoded eyebrow (line 86):

```tsx
              <div className="eyebrow">El proyecto</div>
```

with:

```tsx
              <div className="eyebrow">{item.kind === "Program" ? "El programa" : "El proyecto"}</div>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter spotlight exec vitest run src/routes/impacto-detail.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/spotlight/src/routes/impacto.\$id.tsx apps/spotlight/src/routes/impacto-detail.test.tsx
git commit -m "feat(spotlight): kind-aware detail eyebrow + Programa anual chip in hero"
```

### Task 4: Merged /impacto page — hero copy, stat label, featured band

**Files:**
- Modify: `apps/spotlight/src/routes/impacto.index.tsx`
- Test: `apps/spotlight/src/routes/impacto-index.test.tsx` (create)

- [ ] **Step 1: Export `ImpactoPage` for testing**

In `impacto.index.tsx`, change `function ImpactoPage(` to `export function ImpactoPage(`.

- [ ] **Step 2: Write the failing test**

Create `apps/spotlight/src/routes/impacto-index.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Timestamp } from "firebase/firestore";
import type { ShowcaseItem } from "@luminova/types/engine";

const mk = (id: string, featured: boolean): ShowcaseItem =>
  ({
    id,
    kind: "Project",
    featured,
    title: `T-${id}`,
    description: "d",
    category: "DesarrolloComunitario",
    startDate: Timestamp.fromMillis(0),
    endDate: Timestamp.fromMillis(0),
    completedAt: Timestamp.fromMillis(1),
    impact: { personsImpacted: 10, volunteers: 2, custom: [], closingSummary: "s" },
    photos: [],
    team: { director: null, coDirectors: [], members: [] },
  }) as unknown as ShowcaseItem;

const listState = { data: [] as ShowcaseItem[], loading: false, error: null as Error | null };
vi.mock("../showcase/use-showcase", () => ({
  useShowcaseList: () => listState,
}));

import { ImpactoPage } from "./impacto.index";

function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <>{ui}</>,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/impacto/$id",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("ImpactoPage", () => {
  it("labels the count stat proyectos completados", async () => {
    listState.data = [mk("a", false), mk("b", true)];
    renderWithRouter(<ImpactoPage />);
    expect(await screen.findByText("proyectos completados")).toBeInTheDocument();
  });
  it("renders the Destacados band only when featured items exist", async () => {
    listState.data = [mk("a", false), mk("b", true)];
    renderWithRouter(<ImpactoPage />);
    expect(await screen.findByText("Destacados")).toBeInTheDocument();
    expect(screen.getAllByText("T-b").length).toBe(2); // band + archive grid
  });
  it("hides the Destacados band when nothing is featured", async () => {
    listState.data = [mk("a", false)];
    renderWithRouter(<ImpactoPage />);
    expect(await screen.findByText("T-a")).toBeInTheDocument();
    expect(screen.queryByText("Destacados")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter spotlight exec vitest run src/routes/impacto-index.test.tsx`
Expected: FAIL — stat label is "iniciativas completadas", no "Destacados" text

- [ ] **Step 4: Implement**

In `impacto.index.tsx`:

a) Hero subtitle (replace the "Un archivo curado de los proyectos y programas…" paragraph body):

```
Un archivo curado de los proyectos que JCI Oriente ha realizado — con su gente, sus
cifras y su evidencia. Algunos son programas anuales que repetimos cada gestión.
```

b) Stat label: `iniciativas completadas` → `proyectos completados`.

c) Featured band — add `ShowcaseCardGrid` import and derive featured inside `ImpactoPage`:

```tsx
import { ShowcaseCardGrid } from "../components/showcase/showcase-card-grid";
```

```tsx
  const featured = useMemo(() => data.filter((it) => it.featured), [data]);
```

d) Render the band between the hero and the archive section (only in the success branch — restructure the page body):

```tsx
  return (
    <>
      <ImpactoHero count={count} personsImpacted={personsImpacted} />
      {!loading && !error && featured.length > 0 && (
        <section className="section" aria-label="Proyectos destacados">
          <div className="container">
            <div className="eyebrow">Destacados</div>
            <div style={{ marginTop: 36 }}>
              <ShowcaseCardGrid items={featured} />
            </div>
          </div>
        </section>
      )}
      <section className="section bg-soft">
        <div className="container">
          {loading ? (
            <div className="showcase-grid" aria-busy="true" aria-label="Cargando proyectos">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="showcase-card-skeleton" />
              ))}
            </div>
          ) : error ? (
            <p className="showcase-empty">
              No pudimos cargar los proyectos en este momento. Vuelve a intentarlo más tarde.
            </p>
          ) : data.length === 0 ? (
            <p className="showcase-empty">
              Pronto compartiremos aquí nuestros proyectos ejecutados.
            </p>
          ) : (
            <>
              <div className="eyebrow">Todos los proyectos</div>
              <div style={{ marginTop: 36 }}>
                <ShowcaseGrid items={data} />
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
```

(`bg-soft` on the archive visually separates band from archive; Task 1 design tweaks may override section treatments.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter spotlight exec vitest run src/routes/impacto-index.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/spotlight/src/routes/impacto.index.tsx apps/spotlight/src/routes/impacto-index.test.tsx
git commit -m "feat(spotlight): merged impacto page — featured band, model-sentence hero, proyectos stat"
```

### Task 5: /programas → /impacto redirect

**Files:**
- Modify: `apps/spotlight/src/routes/programas.index.tsx` (full replacement)
- Test: `apps/spotlight/src/routes/programas-redirect.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/spotlight/src/routes/programas-redirect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isRedirect } from "@tanstack/react-router";
import { Route } from "./programas.index";

describe("/programas", () => {
  it("redirects to /impacto", () => {
    expect.assertions(2);
    try {
      Route.options.beforeLoad!({} as never);
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
      expect((e as { options: { to: string } }).options.to).toBe("/impacto");
    }
  });
});
```

(Verified against installed `@tanstack/react-router@^1.170`: `redirect()` throws a Response-derived object with `options.to`; `isRedirect` guards it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter spotlight exec vitest run src/routes/programas-redirect.test.ts`
Expected: FAIL — `expect.assertions(2)` unmet (current route has no `beforeLoad`, nothing throws)

- [ ] **Step 3: Replace the route file wholesale**

`programas.index.tsx` becomes exactly:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/programas/")({
  beforeLoad: () => {
    throw redirect({ to: "/impacto" });
  },
});
```

(ProgramasHero/ProgramasPage die with the old file; no other module imports them.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter spotlight exec vitest run src/routes/programas-redirect.test.ts`
Expected: PASS

- [ ] **Step 5: Full spotlight test suite still green**

Run: `pnpm --filter spotlight exec vitest run`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add apps/spotlight/src/routes/programas.index.tsx apps/spotlight/src/routes/programas-redirect.test.ts
git commit -m "feat(spotlight): redirect /programas to /impacto"
```

### Task 6: Navigation cleanup — header + footer

**Files:**
- Modify: `apps/spotlight/src/components/header.tsx`
- Modify: `apps/spotlight/src/components/footer.tsx`

- [ ] **Step 1: Header**

- Line 8: `const DARK_HERO_ROUTES = ["/", "/programas", "/impacto"];` → `const DARK_HERO_ROUTES = ["/", "/impacto"];`
- Delete the desktop "Programas" anchor (lines 87–93, the `<a href="/programas" …>Programas</a>` block).
- Delete the mobile "Programas" anchor (lines 145–147, the `<a href="/programas" … className="mobile-nav-link">Programas</a>` block).

- [ ] **Step 2: Footer**

Replace the quick-link (lines 70–73):

```tsx
                <a href="/programas" onClick={(e) => go(e, "/programas")}>
                  Programas
                </a>
```

with:

```tsx
                <a href="/impacto" onClick={(e) => go(e, "/impacto")}>
                  Impacto
                </a>
```

- [ ] **Step 3: Verify no stragglers + typecheck**

Run: `grep -rn '"/programas"' apps/spotlight/src --include='*.tsx' | grep -v routes/programas`
Expected: no output.
Run: `pnpm --filter spotlight exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/spotlight/src/components/header.tsx apps/spotlight/src/components/footer.tsx
git commit -m "feat(spotlight): drop Programas nav item, footer links to Impacto"
```

### Task 7: Home page sweep

**Files:**
- Modify: `apps/spotlight/src/routes/index.tsx`
- Modify: `apps/spotlight/src/components/programs-skeleton.tsx`

- [ ] **Step 1: index.tsx edits** (line numbers from current worktree)

| Line | From | To |
|------|------|----|
| 102 | `scrollToId("programas");` | `scrollToId("proyectos");` |
| 105 | `Ver nuestros programas` | `Ver nuestros proyectos` |
| 118 | `programas insignia activos` | `programas anuales` |
| 193 | `<section id="programas" className="section">` | `<section id="proyectos" className="section">` |
| 204 | `<SectionHeader eyebrow="Programas insignia" title="Cinco programas. Un compromiso." />` | `<SectionHeader eyebrow="Proyectos destacados" title="El trabajo que nos enorgullece." />` |

(Task 1 design tweaks may refine the title copy — apply theirs if they specify one.)

- [ ] **Step 2: programs-skeleton.tsx line 5**

`aria-label="Cargando programas"` → `aria-label="Cargando proyectos"`

- [ ] **Step 3: Verify**

Run: `grep -rn -i "programas insignia\|Cinco programas\|Cargando programas" apps/spotlight/src`
Expected: no output.
Run: `pnpm --filter spotlight exec vitest run && pnpm --filter spotlight exec tsc --noEmit`
Expected: PASS / exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/spotlight/src/routes/index.tsx apps/spotlight/src/components/programs-skeleton.tsx
git commit -m "feat(spotlight): home vocabulary sweep — proyectos umbrella, programas anuales stat"
```

### Task 8: Static copy sweep

**Files:**
- Modify: `apps/spotlight/src/routes/contact.tsx:292`
- Modify: `apps/spotlight/src/routes/terminos.tsx:26`
- Modify: `apps/spotlight/src/routes/about.tsx:150`
- Modify: `apps/spotlight/src/site-config/defaults.ts:71`

- [ ] **Step 1: Apply the four copy edits**

| File:line | From | To |
|-----------|------|----|
| `contact.tsx:292` | `Medios de comunicación cubriendo nuestros programas.` | `Medios de comunicación cubriendo nuestros proyectos.` |
| `terminos.tsx:26` | `sus programas e impacto` | `sus proyectos e impacto` |
| `about.tsx:150` | `Las personas detrás de cada programa y cada decisión.` | `Las personas detrás de cada proyecto y cada decisión.` |
| `defaults.ts:71` | `programas estructurados con cohortes` | `proyectos estructurados con cohortes` |

Do NOT touch `defaults.ts:30` ("Expansión de programas" — names real annual programs; allowed by the vocabulary rule) nor any "proyecto(s)" copy already on-jargon.

- [ ] **Step 2: Vocabulary gate**

Run: `grep -rn -i "iniciativa" apps/spotlight/src --include='*.tsx' --include='*.ts' | grep -v routeTree.gen`
Expected: no output (public copy ban).
Run: `grep -rn -i "programa" apps/spotlight/src --include='*.tsx' --include='*.ts' | grep -v routeTree.gen | grep -v "programas-redirect\|programas.index\|programs-skeleton\|home-programs"`
Expected: only hits that mean **annual programs** ("Programa anual" chips, "programas anuales" stat, "El programa" eyebrow, defaults.ts timeline). Review each hit against the spec's vocabulary rules.

- [ ] **Step 3: Test + commit**

Run: `pnpm --filter spotlight exec vitest run`
Expected: PASS.

```bash
git add apps/spotlight/src/routes/contact.tsx apps/spotlight/src/routes/terminos.tsx apps/spotlight/src/routes/about.tsx apps/spotlight/src/site-config/defaults.ts
git commit -m "feat(spotlight): static copy sweep to proyectos jargon"
```

### Task 9: Docs

**Files:**
- Modify: `apps/spotlight/CLAUDE.md` (routes table — stale, missing `/programas`/`/impacto`/`/enlaces` entirely)
- Check: `docs/features.md` (`grep -n programas docs/features.md`; update if it names the `/programas` page)

- [ ] **Step 1:** In `apps/spotlight/CLAUDE.md`, update the Routes table to the real route set:

```markdown
| File | Route | Content |
|------|-------|---------|
| `__root.tsx` | — | Root layout with Header + Footer |
| `index.tsx` | `/` | HomePage |
| `about.tsx` | `/about` | AboutPage |
| `contact.tsx` | `/contact` | ContactPage |
| `impacto.index.tsx` | `/impacto` | Completed-work showcase: featured band + area-filtered archive (single `showcase` fetch) |
| `impacto.$id.tsx` | `/impacto/$id` | Showcase detail; "Programa anual" chip when `kind === "Program"` |
| `programas.index.tsx` | `/programas` | Redirect → `/impacto` (legacy URL) |
| `enlaces.tsx` | `/enlaces` | Linktree |
| `privacidad.tsx` / `terminos.tsx` | `/privacidad` `/terminos` | Legal |
```

Also add one line under Rules: `**Public jargon** — umbrella word "proyectos"; "programa" only for annual institutional programs; "iniciativa" banned. See docs/specs/2026-07-10-impacto-unification-design.md.`

- [ ] **Step 2:** Commit.

```bash
git add apps/spotlight/CLAUDE.md docs/features.md
git commit -m "docs(spotlight): routes table + public jargon rule"
```

### Task 10: Verification + PR

- [ ] **Step 1:** Full app CI: `pnpm --filter spotlight run ci` — expected exit 0 (prettier, eslint, tsc, build, vitest, knip, size-limit).
- [ ] **Step 2:** Invoke `superpowers:verification-before-completion`; manually drive the flow with `pnpm --filter spotlight dev` + emulators if showcase data seeded: `/programas` redirects, band renders, chip renders, nav has no Programas.
- [ ] **Step 3:** Dispatch `bundle-budget-watcher` subagent (route removed + page grew — note the `index` chunk gz delta in the PR body; budgets in `docs/performance.md`).
- [ ] **Step 4:** Run `/simplify` on the diff, then `/code-review`.
- [ ] **Step 5:** Security gate not expected (no beacon/rules/auth/repositories in the diff). If `security-review-gate.sh` still blocks `gh pr create`, run `/security-review`, then stamp per the memory gotcha: capture the sha first (`SHA=$(git rev-parse HEAD)`), one paragraph shared with Co-Authored-By.
- [ ] **Step 6:** Open the PR from the worktree with the repo body template; include:
  - the spec link,
  - bundle delta note,
  - design-pass status (Task 1),
  - **ops item:** the live `siteConfig/current` Firestore doc still carries "programas estructurados…" in `reasons` — president/admin updates it via backstage `/config` after merge.
- [ ] **Step 7:** `pnpm pr-tests` right after opening. Expected: green (known gotcha: a running dev emulator on 4010 can block the rules suite — stop it first).

---

## Self-review notes

- Spec coverage: D1–D5 → Tasks 2–8; D6 deferred (no task, by design); design process → Task 1; sweep map rows all appear in Tasks 4–8; docs section → Task 9; tests/perf sections → Tasks 2–5/10.
- `useShowcaseItem`/data layer untouched (spec "Not doing").
- Type consistency: chip class `showcase-flag` used in Tasks 2 and 3; `mk` fixture kind param matches `ShowcaseItem["kind"]`.
