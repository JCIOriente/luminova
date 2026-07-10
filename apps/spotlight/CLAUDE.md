# Spotlight — Claude Code Guide

## Purpose

Public-facing marketing website for JCI Oriente. No authentication. No Firebase client. Static content only.

## Routes (TanStack Router — file-based)

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

## Key Content

**Organization**: JCI Oriente (Junior Chamber International — Eastern Bolivia)

**Leadership team**:
- Abigail Mamani — President
- Arnold Gandarillas — VP
- Juan Carlos Orellana — VP Area

**Impact stats**: 40+ members, 10+ events, 10+ awards, 20+ projects

**4 program pillars**: Leadership, Community, Entrepreneurship, International

## Page Specs

### HomePage (`/`)
- Hero: full-width with background image overlay, headline, CTA buttons → `/about` and `/contact`
- About section: side image + org description + stats badge
- Programs: 4 cards (Leadership, Community, Entrepreneurship, International)
- Impact stats: grid with numbers
- CTA section: call to join

### AboutPage (`/about`)
- Hero section
- Mission / Vision / Values with icons
- Leadership team grid (3 profiles with photos)
- FAQ tabs: General / Membership / Programs

### ContactPage (`/contact`)
- Contact form: name, email, subject, message, interest
- Form submission: client-side toast only — **no backend call**
- Contact info: address, email, phone, hours
- Social media: Facebook, Instagram, LinkedIn

## Rules

- **No auth** — zero Firebase imports in this app
- **No TanStack Query** — no async data fetching needed
- **Contact form = client-side only** — validate fields, show success toast, reset form. No API call.
- **Real org data** — use actual names, stats, and content (not placeholder lorem ipsum)
- **Responsive** — mobile-first, works on all screen sizes
- **Public jargon** — umbrella word "proyectos"; "programa" only for annual institutional programs; "iniciativa" banned (eslint no-restricted-syntax guard, spotlight-only). "programa" misuse isn't lintable — reviewed by hand. See docs/specs/2026-07-10-impacto-unification-design.md.

## Layout

`__root.tsx` renders: `<Header /> <Outlet /> <Footer />`

Header: fixed nav with links to `/about` and `/contact`, active link highlighting, scroll shadow effect, mobile hamburger menu.

Footer: 4-column grid — quick links, programs, contact info, social links.

## Harness

- **Toolchain.** Node 24, pnpm, Vite, React 19, TS 5.7 strict, TanStack Router, Tailwind v4. Consumes `@luminova/ui`.
- **CI gate.** `spotlight-ci` = prettier-check → eslint → tsc → vite build → vitest → knip (unused) → size-limit. Run via `pnpm --filter spotlight run ci` (rolled into `pnpm pr-tests`). Use `run ci` — bare `pnpm ci` is pnpm's reinstall builtin.
- **Invariants (CI-enforceable).** The showcase may read the public `showcase` Firestore collection via `@luminova/firebase`'s `getFirestoreLite()` (lite SDK, one-shot reads only — no realtime listeners, no auth, no writes). No other Firebase service may be imported; `getFirebase()` is forbidden here. No `@tanstack/react-query`. Contact form client-side only — no network call.
- **Heaviest skills.** `frontend-design` then `ui-ux-pro-max` (brand identity); `react-best-practices` (auto on `.tsx`).
- **Performance.** Public-facing → load perf is the priority. Budgets: initial JS ≤ 100 kB gz, CSS ≤ 15 kB gz, any route chunk ≤ 40 kB gz. LCP is hero **text** (no raster hero); the sans woff2 is preloaded via `preloadJakartaLatin()` in `vite.config.ts` — don't duplicate. Keep firebase on `@luminova/firebase/lite`, fonts latin-only, below-fold reads on `useAsyncOnVisible`. Follow `docs/performance.md`; dispatch `bundle-budget-watcher` after dep/route changes.
- **Sensitive surfaces.** None (no auth, no backend). Dispatch `bundle-budget-watcher` after dep/route additions.
