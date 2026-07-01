# From "OK" to "Wow" — Design Upgrade Brief

> Companion to `docs/design-brief.md`. The first brief told the design skill *what* to build. This one tells it *how* to be unforgettable. It also explains how to combine `frontend-design` and `interactive-prototype` so they reinforce each other instead of producing parallel safe outputs.

---

## 1. Why the first result felt "OK"

The original brief over-specified the recipe and under-specified the vision. Specifically:

| Symptom | Root cause |
|---|---|
| Looks like every other modern NGO site | The brief described tone (*"institutional, modern, optimistic"*) but never committed to a single aesthetic philosophy. "Modern + optimistic" is what AI models default to — that's the slop. |
| Sections feel like a checklist | The brief listed 9 sections for the home page in order. That produces a faithful scroll, not a memorable one. |
| Hero is generic | "Sé el cambio" over a dark background with a ripple is fine but doesn't tell you *why this organisation, not the other 200*. |
| Layouts default to 4-column grids and 3-card rows | I literally said "4-column grid on desktop, 2×2 on tablet, stacked on mobile" — pure distributional convergence. The `frontend-design` skill explicitly fights this. |
| The ripple is decoration, not narrative | I described it as a background pattern. The wow version makes the ripple the *protagonist* of the site. |
| Plus Jakarta Sans is used safely | The brand mandates the typeface, but I treated it like a corporate identity font — same weight, same scale. Wow uses the same font *with conviction*: extreme scale shifts, optical sizing, kinetic composition. |
| No signature moment | If a friend visited the site and texted you back, what would they screenshot? The brief doesn't answer that. |

**The fix is not more constraints — it's a sharper conceptual centre.**

---

## 2. How to use `frontend-design` and `interactive-prototype` together

These two skills do different jobs. Using them in the right order multiplies their value; using them in parallel produces two safe outputs.

### 2.1 What each skill actually does

**`frontend-design`** (Anthropic, official plugin)
- Injects ~400 tokens of design discipline whenever frontend work is detected.
- Forces commitment to a **bold aesthetic direction** — explicitly listed examples: *brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian*.
- Output: **production-grade code** (HTML/CSS/JS or React) that ships.
- Hard rules it enforces:
  - No Inter, Roboto, Arial, system fonts as the body face
  - No purple gradients on white
  - No predictable centered hero / 3-card row / rounded-card layouts
  - Dominant colours with sharp accents (not evenly-distributed palettes)
  - Real motion choreography (staggered page loads beat scattered micro-interactions)
  - Asymmetry, overlap, grid-breaking, generous negative space *or* controlled density
- It will refuse generic AI aesthetics. It wants you to commit.

**`interactive-prototype`** (Anthropic, paired with frontend-design)
- Output: a **single self-contained HTML/CSS/JS file** — clickable, navigable, shareable.
- Designed for *exploration before code*: stakeholders can click through it without a build step or PR.
- Loads three reference packs: **Motion** (timing curves, durations, micro-interactions), **Specs** (component tokens), **Principles** (anti-slop rules).
- Supports a "Tweaks" panel — live in-prototype controls for colour, type, spacing — so you can adjust the design *inside* the prototype without re-prompting.
- React + Babel inline is supported but has known traps the skill knows to avoid.

### 2.2 The right order (do this)

```
       ┌──────────────────────────┐
       │ 1. interactive-prototype │   ← explore 3 directions as clickable HTML
       │    (3 directions)        │      single file each, no React, no setup
       └──────────────┬───────────┘
                      │ pick one
                      ▼
       ┌──────────────────────────┐
       │ 2. interactive-prototype │   ← deepen the chosen direction: all 3 pages,
       │    (chosen direction,    │      real motion, Tweaks panel for live tuning,
       │     full flow + Tweaks)  │      real placeholder copy in Spanish
       └──────────────┬───────────┘
                      │ approve
                      ▼
       ┌──────────────────────────┐
       │ 3. frontend-design       │   ← port to production: TanStack Router routes,
       │    (production code in   │      shadcn components, Tailwind v4 tokens,
       │     apps/spotlight)      │      a11y validated, tests
       └──────────────────────────┘
```

**Why this order:** `interactive-prototype` is cheap to iterate (one HTML file, no build). `frontend-design` is more expensive (touches the actual codebase). Spending 80% of design exploration in the prototype phase and 20% in production keeps both speed and quality high.

### 2.3 Prompts that actually work for each

**Bad prompt:** "Design the spotlight homepage."
→ Output: ok.

**Good prompt for interactive-prototype (exploration):**
> Read `docs/brand-research.md` and `docs/design-brief.md` and `docs/design-wow-upgrade.md`. Build **three** interactive HTML prototype variants of the JCI Oriente home page, each committing fully to a different aesthetic direction from 3 of the wow upgrade brief: **Editorial-Civic**, **Kinetic Ripple**, and **Documentary Maximalist**. Put all three on a single design canvas page (one file) so I can compare side-by-side. Each variant must include: a fully-designed hero, the four areas of opportunity section, and the closing CTA. Use real Spanish copy, real ripple SVG, and at least one signature motion moment per variant. Skip the about/contact pages for this round. Hold yourself to the anti-slop rules in 1.

**Good prompt for interactive-prototype (deepening the chosen direction):**
> I chose **Direction 2: Kinetic Ripple**. Build a single full-flow interactive prototype covering the home, about, and contact pages with working in-page navigation, the signature ripple choreography on the hero (per 3.2 of the wow brief), real Spanish copy, and a **Tweaks panel** exposing: `--accent-color`, `--ripple-density`, `--type-scale`, `--motion-speed`. Use placeholder photography with a duotone treatment in JCI Blue × JCI Black. Optimise for what looks great on a 15" laptop — desktop first, then mobile.

**Good prompt for frontend-design (production):**
> Implement the approved Kinetic Ripple prototype in `apps/spotlight` using TanStack Router file-based routes (`/`, `/about`, `/contact`). Port the design tokens from the prototype into Tailwind v4 CSS variables in `apps/spotlight/src/styles.css`. Build the primitive components listed in 6 of `docs/design-brief.md` and place them in `apps/spotlight/src/components/`. The ripple background must be a parameterised React component using inline SVG with the construction rules from `docs/brand-research.md` 2.4. Match the motion choreography from 3.2 of the wow brief — use the Motion library since this is React. Respect React 19 + TypeScript strict + Tailwind utility-only conventions per `CLAUDE.md`. Write a Vitest test for each route's smoke-render before claiming done.

**Note** — don't paste design tokens into prompts. Point the skill at `docs/brand-research.md` and `docs/design-brief.md` and let it read what it needs. Skills are context-budget-aware.

---

## 3. Three Aesthetic Directions — pick one

Choosing the aesthetic is a taste call. Pick one and commit. The wow factor comes from *commitment*, not from layering multiple styles.

> **My recommendation: Direction 2 (Kinetic Ripple).** It's the most defensible because it weaponises the brand's own central motif as the entire site's spine. It's distinctive without abandoning the institutional posture JCI requires. Directions 1 and 3 are valid alternatives if you want safer or bolder respectively.

### 3.1 Direction 1 — Editorial-Civic *(the safer "wow")*

**One-line pitch:** A serious civic publication. Generous serifs, oversized folios, hairline rules. JCI Oriente as the *New Yorker* of Bolivian non-profits.

**Aesthetic family:** Editorial / Magazine (Pentagram / Vignelli lineage).

**Type composition**
- Display: Plus Jakarta Sans Regular at 96–160px, kerned tight (-0.02em), used as section folios ("01 — Quiénes Somos")
- Body: same family, Regular 18px, generous line-height (1.65), long measures (no narrow columns)
- Eyebrow labels: Plus Jakarta Sans SemiBold all-caps, 11px, tracking 0.18em
- Pull-quotes in Arvo at 36px, asymmetrically indented

**Layout vocabulary**
- Asymmetric two-thirds / one-third splits, never 50/50
- Hairline horizontal rules in JCI Blue between sections (1px, full-bleed)
- Section numbers ("01 / 06") top-right of every section
- Photography full-bleed, monochrome with a single colour-pop accent
- Body copy left-aligned, ragged right — never justified

**Signature moment**
A "table of contents" hero. The home page opens with an oversized section index (six numbered chapter titles stacked vertically, *New Yorker* style). Clicking a chapter title scrolls to that section with a kinetic transition where the title shrinks into the section header. No carousel, no rotating banner — just typographic gravitas.

**Colour use**
- 80% white space
- 15% JCI Black
- 5% JCI Blue (rules, links, accent moments)
- Yellow appears ONCE on the entire site, on the final CTA

**Motion**
Quiet. Hairline rules draw left-to-right on scroll (600ms ease-out). Type fades up 8px. No bouncing, no scaling, no parallax.

**Risk:** Could read as too austere for a youth org. The fix: documentary photography with energy and warmth balances the cool typography.

---

### 3.2 Direction 2 — Kinetic Ripple ⭐ *(recommended)*

**One-line pitch:** The ripple isn't decoration — it's the entire site's spine. Every section emerges from, transitions through, or resolves into ripple geometry.

**Aesthetic family:** Organic / kinetic minimalism (think Stripe Press × Linear × the way Apple uses geometric primitives on product pages).

**Type composition**
- Display: Plus Jakarta Sans Light at 72–120px (the brand says "lean lighter" — believe it). Tight leading (1.05).
- Subtitle: Plus Jakarta Sans Regular 28px, 1.4 leading
- Body: Plus Jakarta Sans Regular 17px
- Numerical stats: Plus Jakarta Sans Light at 144–200px — almost obscene, used sparingly
- One handwritten-feel accent for Spanish phrases? No — keep it disciplined. The kinetic energy comes from motion, not typeface mixing.

**Layout vocabulary**
- Single-column for prose at `max-w-2xl`, but ripple SVGs break the column edges with full-bleed bleed
- Off-axis ripple compositions — never centered
- "Quiet panels" alternating with "loud panels": white prose → black ripple-dominant → white prose
- No card-grid for the four areas — instead, a *single* large layered composition with all four areas as nested ripple quadrants the user explores by hovering

**Signature moment ★ THE WOW**

The home hero is a **ripple that builds itself**, in choreographed time:

```
t = 0ms     screen is JCI Black
t = 200ms   innermost ring fades in (opacity 0 → 0.15) at viewport centre
t = 400ms   ring 2 fades in, rotated 15° from ring 1
t = 600ms   ring 3 fades in, rotated 15° from ring 2
...continuing outward until t = 2200ms, 11 rings deep, ripple fills viewport
t = 2400ms  the H1 "Sé el cambio." fades up from inside the innermost ring
            (Plus Jakarta Sans Light, 96px, white)
t = 2800ms  subtitle slides in below
t = 3000ms  CTA pill appears with a soft pulse

On scroll:  the entire ripple gracefully *contracts* — outer rings fade and
            shrink inward until what remains is the small ripple inside the
            header logo. The hero animation has *literally become the brand mark*.
            (600ms ease-out, scroll-locked.)
```

That's the one thing someone screenshots and shares.

**Other moments**
- Hovering an "area of opportunity" rotates that quadrant of a large central ripple +15°, others fade
- The four stat numbers count up on scroll-into-view from 0 to their target in 1.2s with `cubic-bezier(0.16, 1, 0.3, 1)` easing
- Section transitions: a ripple ring sweeps top-to-bottom as a divider mark, 800ms
- Footer: the ripple is "drawn" as if by compass — the four quadrants rotate into place on first viewport entry

**Colour use**
- Hero and final CTA: JCI Black `#130F2D` dominant, ripple in JCI Blue at 8–20% opacity
- Mid-page sections: white dominant, JCI Blue as the active accent
- Yellow: single appearance on the impact stat strip (the "32 años" number is in JCI Yellow)
- Teal makes one appearance — the "Mission / Vision / Values" cards on the About page

**Motion timing language (use throughout)**
- Default ease: `cubic-bezier(0.16, 1, 0.3, 1)` (Apple-style "out-expo")
- Default duration: 600ms for entrances, 200ms for hovers, 1500–2200ms for the hero ripple
- Stagger: 80ms between sibling elements
- Reduced-motion: drop all transforms, keep opacity-only fades at 200ms

**Photography**
Single duotone treatment site-wide: JCI Blue × JCI Black (shadows). Real photos of JCI Oriente members at projects — World Clean Up Day, Madre Emprendedora. The duotone gives unity even with disparate source quality.

**Risk:** Motion-heavy sites can feel gimmicky. Mitigation: every motion moment has *meaning* (the ripple emerging *is* the brand promise of impact radiating outward). And reduced-motion users get a perfectly composed static page.

---

### 3.3 Direction 3 — Documentary Maximalist *(the bold "wow")*

**One-line pitch:** Lead with the people. The site is built around large, atmospheric photographs of Oriente members at their projects — type lives *on* the photography, not next to it.

**Aesthetic family:** Editorial documentary (think *MagnumPhotos.com* meets *Patagonia.com*).

**Type composition**
- Display: Arvo (the brand's slab serif) at 80–140px — overrides Plus Jakarta Sans for hero moments because Arvo carries gravitas the sans can't
- Display secondary: Plus Jakarta Sans Light at 64px
- Body and UI: Plus Jakarta Sans Regular
- Captions in italic Plus Jakarta Sans 14px, photo-credit style

**Layout vocabulary**
- Hero is a full-bleed photograph (not a ripple, not a blue panel) of a real member mid-action
- H1 sits *on* the photo, white, large Arvo, with a soft black gradient at the bottom for legibility
- Sections alternate: photo-as-section (full-bleed image with overlaid text) and text-only sections with generous whitespace
- The four areas are presented as four full-bleed photo panels stacked vertically, each labelled with a number + Arvo title

**Signature moment**
The hero photograph **slowly zooms** (Ken Burns effect, 20s cycle) and the H1 *types itself* character by character on first load. The first time you see the site, the experience feels cinematic. Subsequent visits, the typing is replaced by a fade-up (don't be annoying).

**Colour use**
- Photography drives the palette (it's mostly the photo)
- JCI Blue appears only as: link colour, button colour, accent rule
- JCI Black as text overlay surface (with backdrop-blur for legibility on photos)
- Yellow: single use as a sticker-like badge on one stat ("Org. más sobresaliente · 2021")

**Risk:** Demands real, high-quality photography. Without it, this direction collapses. If JCI Oriente has a usable photo archive, this is the most emotionally resonant choice. If you'd need to source stock, skip it — pick Direction 2.

---

## 4. Universal "wow" upgrades (apply regardless of direction)

These are direction-agnostic upgrades to the original brief.

### 4.1 Kill the safe layouts
- No 3-card or 4-card grid for the areas of opportunity. Pick *one* layout that's *not* a grid: vertical stack with oversized numbers, single nested-ripple composition, alternating left/right asymmetric blocks, a numbered list at 80px type, a horizontal scroll with snap-points.
- No "logos in a row" partners strip. Replace with a single quote from a partner with an attribution and the logo as a small mark.
- No carousels. Ever.

### 4.2 Make numbers the visual hierarchy
Stats are JCI Oriente's strongest content (32 years, 11+ awards, 100% efficiency twice). Set them at 144–200px. Numbers like that *are* design.

### 4.3 Spanish copy that earns its place
Replace bland CTAs with phrases that sound like a movement:

| Bland | Memorable |
|---|---|
| "Únete a JCI Oriente" | "Postúlate. El Oriente te espera." |
| "Conoce más" | "Empieza por nuestra historia →" |
| "Contáctanos" | "Cuéntanos qué quieres cambiar." |
| Hero: "Sé el cambio." | Hero: "Sé el cambio que el Oriente necesita." *(longer, more local, more committed)* |
| Footer tag: "Capítulo Santa Cruz de JCI" | "Santa Cruz, desde 1993. Donde el liderazgo se construye haciendo." |

### 4.4 One unforgettable detail per page
- Home: the signature moment from your chosen direction
- About: a vertical timeline that *animates* (line draws from top to bottom on scroll, dots pop at each milestone with the year scaling up briefly)
- Contact: the form's submit button morphs into a checkmark with a ripple emanating from it on success — the brand mark itself becomes the confirmation

### 4.5 Real cursor and focus craft
- Custom cursor: a small JCI Blue circle that grows slightly when hovering interactive elements (`mix-blend-mode: difference` for visibility on dark sections). Falls back to default on touch / reduced-motion.
- Focus rings as small ripple emanations rather than rectangles — match the brand language

### 4.6 Image discipline
Whatever photography direction you choose, **commit to one treatment** for every image on the site:
- All duotone Blue × Black, OR
- All untreated full-colour with consistent warm grade, OR
- All black-and-white with one accent (sticker / pin in JCI Blue)

Mixing treatments is what makes "ok" sites look amateur.

### 4.7 Loading and empty states
The site has no async data (it's static), but the prototype phase should still show:
- An intentional loading state: the ripple drawing itself before the hero appears (matches the signature moment, only longer)
- A 404 page that's a single full-screen ripple with "Esta página se desvaneció. Volver al inicio →"

### 4.8 Sound? (optional, bold)
A single sound — a soft "rim" tone — when the hero ripple completes its build-out, off by default, with a tiny unobtrusive 🔊 toggle in the bottom-right. 99% of sites don't do this. The 1% that do are memorable. Skip if it feels too much.

---

## 5. The Tweaks panel — what to expose in the prototype

When you ask `interactive-prototype` to add Tweaks, ask for these specific knobs so you can tune the design live without re-prompting:

```
ACCENT          → cycle: JCI Blue / JCI Navy / JCI Teal
TYPE SCALE      → slider: 0.85 ↔ 1.15  (multiplier applied to all sizes)
TYPE WEIGHT     → cycle: Light / Regular / SemiBold for display
RIPPLE DENSITY  → slider: 4 rings ↔ 16 rings
RIPPLE OPACITY  → slider: 0.04 ↔ 0.25
MOTION SPEED    → cycle: 0.5x / 1x / 2x   (multiplies all transition durations)
PHOTO TREATMENT → cycle: untreated / duotone / b&w
SECTION DENSITY → cycle: spacious (py-32) / standard (py-24) / compact (py-16)
```

These are the eight levers that make or break the feel. Tune the prototype until it sings, then port the chosen values to the production Tailwind tokens.

---

## 6. Anti-slop checklist (paste into the design prompt)

Before claiming "done", any prototype or page must pass these:

- [ ] No Inter, Roboto, Arial, or system font in the body face
- [ ] No purple anywhere
- [ ] No 3-card or 4-card identical-tile grid
- [ ] No centered "Welcome to" / "Bienvenido a" hero copy
- [ ] No rotating carousel
- [ ] No rounded-card-with-left-border component
- [ ] No CSS gradient orb representing "AI" or "energy"
- [ ] No stock photo of a multi-ethnic team smiling at a laptop
- [ ] No emoji bullet points
- [ ] At least one section breaks the page grid (full-bleed, asymmetric, or overlapping)
- [ ] At least one type element is set at 80px+
- [ ] Motion choreography exists on first page load (not just hover states)
- [ ] One "signature moment" identifiable in a 5-second screen-record
- [ ] Reduced-motion users see a fully composed static version

---

## 7. Working session order

1. **You:** decide which of the three directions in 3 you want (or pick "show me all three").
2. **Claude Design — interactive-prototype:** build the chosen direction(s) as clickable HTML prototype(s), home page only. Use the *exploration* prompt from 2.3.
3. **You:** click through, pick one direction, send screenshots / notes of what to amplify and what to dial back.
4. **Claude Design — interactive-prototype:** build the full 3-page flow with Tweaks panel. Use the *deepening* prompt from 2.3.
5. **You:** play with the Tweaks until the feel is right. Note the final token values.
6. **Claude Code — frontend-design:** port to `apps/spotlight` production code with React/TanStack Router/Tailwind. Use the *production* prompt from 2.3.
7. **Claude Code — ui-ux-pro-max:** accessibility and contrast validation pass.
8. **Claude Code — `/simplify` and `react-best-practices`:** code health cleanup.
9. **Claude Code — `/security-review`:** even on a static site, run it once (contact form, third-party fonts, CSP).

---

## 8. TL;DR

- The first brief was a recipe. This one is a vision.
- Use `interactive-prototype` for cheap exploration, then `frontend-design` for production code. Don't run them in parallel.
- Commit to **one** aesthetic direction. I recommend **Kinetic Ripple** (3.2).
- The signature moment matters more than any single section: the ripple-builds-itself hero that resolves into the header logo on scroll.
- Replace every safe choice (grids, carousels, bland CTAs, neutral copy) with one bold one.
- Tune live with Tweaks, then port the values to production.
