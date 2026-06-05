# Spotlight — Design Brief

> Hand-off document for the `frontend-design` skill (and `ui-ux-pro-max` for validation). Everything here is prescriptive. The research backing each decision lives in `docs/brand-research.md`.

**Project:** `apps/spotlight` — public marketing site for **JCI Oriente** (Junior Chamber International, Eastern Bolivia chapter).
**Routes:** `/` (Home), `/about` (Quiénes Somos), `/contact` (Contacto). No auth. Contact form is client-side only.
**Language:** Spanish (Bolivian register). Tagline "Become the Change" pairs with "Sé el cambio."
**Stack constraint:** React 19 + TanStack Router + Tailwind v4 + shadcn/ui. All components must be implementable with Tailwind utility classes.

---

## 1. North Star

Build an **institutional, modern, optimistic** site that feels like a global movement with deep local roots. The visitor should leave with three impressions, in order:

1. *This is a serious, century-old global organisation.*
2. *The local chapter is active, accomplished, and welcoming.*
3. *I can see myself joining.*

**Anti-pattern to avoid:** the generic chamber-of-commerce template — rotating stock-photo banners, multi-coloured gradients, "Welcome to our website" hero copy, cluttered grids of committee photos.

**Reference aesthetic energy** (not visual copying): the clarity of Stripe, the calm density of Linear, the institutional confidence of MIT/Stanford homepages, the human warmth of the new Airbnb. Combine those — JCI Oriente is closer to "global NGO meets modern fintech" than "civic non-profit."

---

## 2. Design Tokens (use exactly these values)

### 2.1 Colour — copy these into `tailwind.config` / CSS variables

```css
/* Primary */
--jci-blue:   #0097D7;  /* dominant brand colour, primary action */
--jci-black:  #130F2D;  /* deep navy/indigo — body text + dark surfaces. NOT pure black. */
--jci-white:  #FFFFFF;

/* Secondary */
--jci-navy:   #1F4789;  /* use where blue lacks contrast, e.g. small body links */
--jci-teal:   #57BCBC;  /* accent for variety, secondary illustrations */
--jci-yellow: #EFC40F;  /* sparing accent only, single highlights */

/* Sanctioned tints — generate as 25 / 50 / 75% opacity over white */
```

#### Distribution rule (per layout)
| Colour | Approx. share |
|---|---|
| White space | 50–60% |
| JCI Black (text + dark sections) | 20–25% |
| JCI Blue (accents, CTAs, links, brand surfaces) | 15–20% |
| Navy / Teal | 5–10% combined |
| **Yellow** | **≤ 5%** — never as a section background |

#### Pairing rules (non-negotiable)
- **Body text:** JCI Black on white. Never JCI Blue on white for body (3.4:1 fails WCAG AA for body).
- **Buttons / large headings on white:** JCI Blue is fine.
- **Body text on dark surfaces:** JCI White or `rgba(255,255,255,0.85)` on JCI Black.
- **Yellow:** never as text colour. Only as background fill with JCI Black text on top, or as a decorative accent on dark surfaces.
- **Teal on Blue, Yellow on White:** forbidden combinations.

### 2.2 Typography — `Plus Jakarta Sans` + `Arvo`, both Google Fonts

```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;700&family=Arvo&display=swap" rel="stylesheet">
```

```css
--font-sans:  'Plus Jakarta Sans', system-ui, sans-serif;
--font-serif: 'Arvo', Georgia, serif;  /* pull-quotes ONLY */
```

**Weight discipline (per the brand guidelines, lean lighter):**
- Hero displays and large titles → `font-weight: 400` (Regular). Resist the urge to make every headline bold.
- Subheads → `400` (Regular) at larger sizes, `600` (SemiBold) at smaller sizes
- Body → `400`
- Buttons / nav / labels → `600`
- Bold (`700`) is reserved for: the location-name lockup ("Oriente") and emphasised inline text

**Type scale for web (translated from the brand guidelines' print pt sizes):**

| Token | Element | Size (desktop) | Size (mobile) | Line height | Weight |
|---|---|---|---|---|---|
| `text-display` | Hero H1 | 64–72px | 40–48px | 110% | 400 |
| `text-title` | Section H2 | 40–48px | 32px | 120% | 400 |
| `text-subtitle` | H3 / lead paragraph | 22–24px | 20px | 130% | 400 |
| `text-subheading` | H4 / card title | 20px | 18px | 140% | 600 |
| `text-body` | Paragraph | 16–17px | 16px | 150% | 400 |
| `text-small` | Caption / label | 14px | 14px | 140% | 400 |
| `text-quote` | Pull-quote | 28–32px | 22–24px | 130% | 400 (Arvo) |

Tracking: `0` everywhere except all-caps labels (use `0.06em`).

### 2.3 Spacing

Tailwind defaults are fine. Treat sections as **generous**: minimum `py-24` on desktop section padding, `py-16` on mobile. Container max-width `1200px` (Tailwind `max-w-7xl` is acceptable). Inner content max-width for prose `640px` (`max-w-2xl`).

### 2.4 Radii & shadows

- Cards / inputs: `border-radius: 12px` (`rounded-xl`)
- Buttons: `border-radius: 9999px` (pill, `rounded-full`) — modern, optimistic, on-brand
- Shadows: subtle. `shadow-sm` for resting cards, `shadow-lg` on hover. Avoid heavy drop-shadows.

### 2.5 Motion

- Hover transitions: `150ms ease-out`
- Section reveal on scroll: `400ms ease-out` with `translateY(12px)` fade-in
- The ripple background should subtly animate (slow rotation or pulse, **~20s** per cycle, low opacity ~0.06)
- Respect `prefers-reduced-motion` — drop all decorative motion to opacity-only fades

---

## 3. The Ripple — the signature graphic motif

The ripple is **the one decorative element this site uses**. No other geometric shapes, no abstract blobs, no triangles, no diagonal slashes. The ripple does all the work.

**Construction (build as inline SVG, parameterised):**
- Concentric rings, each ring split into 4 equal quarters with a gap between quarters equal to the ring's stroke width
- Spacing between rings = ring stroke width
- **Each ring rotated 15° relative to the next inner ring** — this is the secret to the motion
- Expand outward by adding rings using the same spacing rules

**Where to use it:**
- **Hero background** — large, low-opacity ripple emanating from behind the H1 or from a corner
- **Section dividers** — small ripple as a divider mark between sections
- **Card hover state** — subtle ripple appears behind the icon
- **Loading spinners and empty states**
- **Footer** — faded ripple watermark

**Where NOT to use it:**
- Inside the logo lockup (the logo already contains it)
- As a decorative border on every card (over-use kills the motif)
- Animated faster than ~20s per cycle (it should feel ambient, not busy)

Colour the ripple in JCI Blue at low opacity (5–10%) on light backgrounds, JCI White at low opacity on dark backgrounds. Avoid multi-colour ripples.

---

## 4. Logo Usage

The site is for the local chapter, so the **National/Local lockup variant** is the default mark:

```
[ shield icon ]  Oriente
                 (in JCI Blue, Plus Jakarta Sans Bold, left-aligned to logo,
                  aligned to the bottom of the shield, no gap)
```

- Header (top-left): full lockup, shield + JCI wordmark + "Oriente" beneath
- Footer: full lockup, inverted (white on JCI Black background)
- Favicon / social cards: shield icon only
- Minimum clearspace on all sides = ½ shield width
- Minimum digital size: 32px height — never smaller

**Forbidden:** rotating, stretching, recolouring, outlining, adding effects, separating elements, changing spacing.

---

## 5. Page-by-Page Brief

### 5.1 `/` — Home

Build top-to-bottom, in this order:

1. **Header (sticky, transparent over hero, solid on scroll)**
   - Left: local logo lockup
   - Right: nav (`Quiénes Somos` · `Contacto`) + primary CTA pill button (`Únete a JCI Oriente` — anchors to contact)
   - Mobile: hamburger menu, full-screen overlay

2. **Hero (full viewport height on desktop, ~80vh on mobile)**
   - Background: JCI Black `#130F2D` with a large, low-opacity blue ripple emanating from bottom-right
   - H1 in Plus Jakarta Sans Regular: **"Sé el cambio."** (white, ~72px desktop)
   - Subtitle below: a single sentence connecting Oriente to the global JCI movement ("Capítulo Santa Cruz de la Cámara Junior Internacional. Desarrollando líderes desde 1993.")
   - Two CTAs: primary pill `Conoce JCI Oriente`, secondary text-link with arrow `Ver nuestros programas →`
   - Optional small element top of hero or bottom: rotating year counter or simple stat ("+32 años · 5 programas insignia · 1 movimiento global")

3. **"Qué es JCI" intro block**
   - White background, generous padding
   - Two-column on desktop, stacked on mobile
   - Left: H2 "Una red global con raíces locales"
   - Right: 2–3 short paragraphs explaining the JCI–JCI Oriente relationship
   - Inline stat row or single pull-quote in Arvo: *"Más de 200.000 miembros en 100+ países, 17 organizaciones en Bolivia, 1 capítulo en Santa Cruz."*

4. **Four Areas of Opportunity (the brand pillars)**
   - Section title H2: "Cuatro áreas de oportunidad"
   - Light grey or off-white background (`#F7F9FB`)
   - 4-column grid on desktop, 2×2 on tablet, stacked on mobile
   - Each card: large numerical label (01–04), icon, title, 2-sentence description
     - 01 — Desarrollo Individual
     - 02 — Acción Comunitaria
     - 03 — Cooperación Internacional
     - 04 — Negocio y Emprendimiento
   - Cards have subtle border (`border border-black/5`), `rounded-xl`, padding `p-8`, hover state lifts with shadow and shows a small ripple behind the icon

5. **Programas insignia (Flagship programs)**
   - Section title H2: "Nuestros programas"
   - Horizontally-scrolling cards on mobile, 3-up grid on desktop with a "Ver todos" link
   - Each program: photo (placeholder for now), name, 1-line description
     - World Clean Up Day
     - Madre Emprendedora
     - Emprende Oriente
     - Transformando Vidas
     - Creando Oportunidades
   - Card style: full-bleed image at top, text overlay or below, `rounded-xl`, `overflow-hidden`

6. **Impact / track record strip**
   - Full-width band, JCI Blue `#0097D7` background, white text
   - 4 large stat numbers: `+32 años activos` · `Organización Local más sobresaliente 2021` · `100% eficiencia 2019 & 2020` · `+11 reconocimientos nacionales`
   - Use Plus Jakarta Sans Regular at very large size (72px+) for the numbers

7. **Aliados / Partnerships**
   - Light section, "Confían en nosotros"
   - Logo strip: Unifranz, JCI Bolivia, JCI Worldwide, plus space for additional allies (pulled from the Backstage `allies` collection in a later iteration)
   - Logos in greyscale by default, full colour on hover

8. **Final CTA band**
   - Dark section (JCI Black), centered content
   - H2: "Conviértete en el cambio que el Oriente necesita."
   - Single primary CTA pill button: `Contáctanos`
   - Ripple watermark behind

9. **Footer**
   - JCI Black background, white text at 85% opacity
   - 4 columns: lockup + tagline · Sitemap · Contacto · Redes sociales
   - Bottom strip: copyright, "Miembro de JCI Bolivia" with link, official `jci.cc` link
   - Faded ripple watermark in a corner

### 5.2 `/about` — Quiénes Somos

1. **Page hero** (smaller than home — ~50vh, JCI Blue background, white text)
   - Eyebrow label: "Quiénes Somos"
   - H1: "Desarrollando líderes en el Oriente boliviano desde 1993."

2. **Brand story** (white section, single-column prose, `max-w-2xl`)
   - Adapt the JCI "Become the Change" story, localised to Oriente
   - Use a pull-quote in Arvo midway: a phrase from the JCI Creed or the founding mission

3. **Mission · Vision · Values** (3-card layout)
   - Each card: short title + 2-3 sentence statement
   - Use JCI Teal as the accent on this section to differentiate

4. **Timeline / Hitos** (vertical timeline on desktop, accordion on mobile)
   - Key dates: 1915 (JCI founded), 1993 (JCI Oriente founded), 2018, 2019, 2020, 2021 award entries, today
   - Each entry: year, title, 1-line description
   - Connector line uses JCI Blue, milestone dots are filled circles

5. **Comité Ejecutivo** (placeholder section)
   - Grid of member cards (photo, name, role)
   - For v1, show a "Próximamente" state with a single illustration — content fills in once Backstage has data

6. **"Por qué unirte" closing block**
   - 3 reasons in card form, each with a number and short paragraph
   - CTA at bottom: `Únete a JCI Oriente`

### 5.3 `/contact` — Contacto

Two-column layout on desktop, stacked on mobile.

**Left column:**
- H1: "Hablemos."
- Subtitle: short sentence about who should reach out (prospective members, partners, press)
- Direct contact list:
  - Email: `jci.orienteolm@gmail.com` (clickable mailto)
  - Social: Facebook, Instagram, TikTok (icons, JCI Blue, hover → JCI Navy)
  - Physical address (placeholder until provided)

**Right column:**
- Contact form (shadcn `<Form>` + `<Input>` + `<Textarea>` + `<Button>`)
  - Fields: `Nombre*`, `Email*`, `Asunto*` (select: Membresía / Alianza / Prensa / Otro), `Mensaje*`
  - Validation inline (Zod + React Hook Form per project conventions)
  - Submit button: pill, JCI Blue, full width on mobile
  - On submit (client-side only, no backend): show success toast "Mensaje enviado. Te responderemos a la brevedad." — form is reset
  - Below form: small text note that says responses come from `jci.orienteolm@gmail.com`

**Below the two columns (full width):**
- Embedded map (Google Maps iframe, placeholder coordinates Santa Cruz centre) — keep it muted, grayscale filter if possible
- Or, if no physical address yet: a final CTA band with social links

---

## 6. Components to Build (shared, in `packages/ui` or in `apps/spotlight/src/components/`)

Build these as the primitives, then compose pages from them:

- `<RippleBackground variant="hero" | "subtle" | "footer" />` — parameterised SVG ripple
- `<LogoLockup variant="default" | "inverted" | "icon-only" />` — handles the local "Oriente" lockup
- `<PillButton variant="primary" | "secondary" | "ghost" />` — pill-shaped CTAs
- `<SectionHeader eyebrow="..." title="..." subtitle="..." />` — consistent section opener
- `<StatBlock value="..." label="..." />` — large-number stat display
- `<AreaCard number="01" icon={...} title="..." description="..." />` — the 4-pillar card
- `<ProgramCard image="..." title="..." description="..." />` — flagship program tile
- `<TimelineItem year="..." title="..." description="..." />` — about-page timeline
- `<Footer />` — full footer
- `<Header />` — sticky transparent → solid header

All components: TypeScript strict, no `any`, default exports, no required props beyond data (sensible defaults for all visual variants).

---

## 7. Tone & Copy Direction

- **Language:** Bolivian Spanish. Warm but professional. No corporate jargon. No exclamation marks except in one place: the hero tagline.
- **Voice:** confident, action-oriented, inclusive. First person plural ("nosotros / nuestra organización").
- **Don't say:** "Bienvenido a nuestro sitio web," "Somos una organización sin fines de lucro que…" (passive, generic). 
- **Do say:** Sentences that lead with verbs and impact ("Formamos líderes," "Creamos impacto," "Conectamos jóvenes").
- **Numbers and proof:** lean on them. 200,000+ members. 100+ countries. 1915 founding. 1993 in Santa Cruz. 2021 best local org. These are credibility anchors — use them.

---

## 8. Accessibility (validation pass with `ui-ux-pro-max`)

Non-negotiable checks before claiming a section "done":

- **All body text:** contrast ratio ≥ 4.5:1 against its background
- **All large text (≥24px) and UI components:** ≥ 3:1
- **Focus rings:** visible, 2px JCI Blue with 2px offset, on every interactive element
- **Headings:** semantic order (no skipped levels)
- **Images:** every `<img>` has meaningful `alt` (decorative ripples use `alt=""` + `aria-hidden`)
- **Form:** every input has a visible label (not just placeholder), errors announced via `aria-live="polite"`
- **Touch targets:** ≥ 44×44px on mobile
- **Motion:** every animation respects `prefers-reduced-motion`
- **Lang attribute:** `<html lang="es">`

---

## 9. Workflow

When you start designing:

1. Invoke `frontend-design` with this brief as input — produce aesthetic direction artefacts (palette study, typography specimen, hero composition mock, ripple system, component primitives)
2. Then invoke `ui-ux-pro-max` to validate: palette contrast, typography pairing, a11y on every layout, mobile breakpoints
3. Only after both passes are clean, implement in `apps/spotlight` using TanStack Router file-based routes
4. Per `CLAUDE.md`: write tests first (TDD via `superpowers:test-driven-development`), run `react-best-practices` on every `.tsx`, then `/simplify` and `/security-review` before merging

---

## 10. Out of Scope (don't design these now)

- Member portal or login (lives in Backstage, not Spotlight)
- Blog / news section (mention as a future enhancement only)
- Multi-language switcher (Spanish only for v1)
- Donation / payment flow
- Event calendar synced to Firestore (future — Spotlight is static for v1)

---

**Reference:** all sourcing and rationale lives in [`docs/brand-research.md`](./brand-research.md). When in doubt about a colour value, font weight, or motif rule, that file is the source of truth and links to the official JCI Brand Guidelines PDF.
