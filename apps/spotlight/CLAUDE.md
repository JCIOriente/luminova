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

## Layout

`__root.tsx` renders: `<Header /> <Outlet /> <Footer />`

Header: fixed nav with links to `/about` and `/contact`, active link highlighting, scroll shadow effect, mobile hamburger menu.

Footer: 4-column grid — quick links, programs, contact info, social links.
