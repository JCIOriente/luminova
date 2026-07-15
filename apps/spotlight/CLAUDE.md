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
| `linktree.tsx` | `/linktree` | Linktree |
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
- Contact form: name, email, intent, message (+ hidden honeypot)
- Form submission: persists a `leads` doc via `submitLead` (lite `addDoc`) — three states (submitting / success toast / error), then reset
- Reach hub: WhatsApp direct-chat + Difusión Oriente channel CTAs (from `siteConfig.contact.whatsapp` / `broadcastChannel`, `safeHref`-guarded, hidden when empty)
- Contact info: address, email, phone, hours
- Social media: Facebook, Instagram, LinkedIn

## Rules

- **No auth** — zero Firebase imports in this app
- **No TanStack Query** — no async data fetching needed
- **Contact form persists a lead** — validate with `leadSchema`, write one `leads` doc via `submitLead` (lite `addDoc`), then success toast + reset. This is the site's ONE write; the `leads` create rule (firestore.rules) is the trust boundary. Handle all three states (submitting / success / error) — never swallow the write error.
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
- **Invariants (CI-enforceable).** Firestore access is lite-SDK only, via `@luminova/firebase`'s `getFirestoreLite()` — one-shot reads (the public `showcase` collection) plus the single `leads` **create** the contact form performs (`submitLead`, `addDoc`). No realtime listeners, no auth reads, no other collection written. The lite path also initializes **App Check** (reCAPTCHA v3) via the shared `initAppCheck` so those reads/writes carry a valid token under Firestore enforcement — that is the only other Firebase service imported. `getFirebase()` (auth/storage/functions) is forbidden here (eslint steers `@luminova/firebase` → `/lite`). No `@tanstack/react-query`.
- **Heaviest skills.** `frontend-design` then `ui-ux-pro-max` (brand identity); `react-best-practices` (auto on `.tsx`).
- **Performance.** Public-facing → load perf is the priority. Budgets: initial JS ≤ 100 kB gz, CSS ≤ 15 kB gz, any route chunk ≤ 40 kB gz. LCP is hero **text** (no raster hero); the sans woff2 is preloaded via `preloadJakartaLatin()` in `vite.config.ts` — don't duplicate. Keep firebase on `@luminova/firebase/lite`, fonts latin-only, below-fold reads on `useAsyncOnVisible`. Follow `docs/performance.md`; dispatch `bundle-budget-watcher` after dep/route changes.
- **Sensitive surfaces.** None (no auth, no backend). Dispatch `bundle-budget-watcher` after dep/route additions.
