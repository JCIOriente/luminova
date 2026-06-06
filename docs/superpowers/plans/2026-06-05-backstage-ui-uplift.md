# Backstage UI Uplift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift `apps/backstage` to the Claude Design "Backstage" admin dashboard — app shell (sidebar + topbar), a composed Overview, and restyled Members/Allies — on the existing `@luminova/ui` JCI tokens.

**Architecture:** Reusable presentational primitives (Badge, KpiCard, Sparkline, LineChart, Skeleton, EmptyState) + admin icons go into `@luminova/ui` as pure-Tailwind components; all non-trivial geometry/config lives in **pure helper modules** so it can be unit-tested in the ui package (which has no DOM test runner). The backstage-only app shell and Overview live app-local and are behavior-tested in backstage (jsdom + RTL). Overview mixes real `useMembers`/`useAllies` counts with a clearly-named mock module for not-yet-backed widgets.

**Tech Stack:** React 19, TypeScript strict, TanStack Router/Query v5, Tailwind v4, Vitest + Testing Library (backstage only), dependency-free inline SVG charts.

**Spec:** `docs/superpowers/specs/2026-06-05-backstage-ui-uplift-design.md`

---

## File Structure

**`packages/ui/src/` (reusable):**
- `theme.css` (modify) — add status color tokens + skeleton/rise animations.
- `components/icons.tsx` (modify) — add admin glyphs.
- `components/badge.tsx` (create) — status pill.
- `components/sparkline.ts` + `components/sparkline.tsx` (create) — pure path helper + component.
- `components/line-chart.ts` + `components/line-chart.tsx` (create) — pure geometry + dual-series chart.
- `components/kpi-card.tsx` (create), `components/skeleton.tsx` (create), `components/empty-state.tsx` (create).
- `components/sparkline.test.ts`, `components/line-chart.test.ts` (create) — pure-helper unit tests.
- `index.ts` (modify) — export the new components.

**`apps/backstage/src/` (app-local):**
- `components/nav-config.ts` (create) + `nav-config.test.ts` — pure nav model.
- `components/app-sidebar.tsx` (rewrite), `components/app-topbar.tsx` (create) + `breadcrumb.ts` (create) + `breadcrumb.test.ts`.
- `routes/_app.tsx` (rewrite) — shell grid.
- `components/overview/overview-mock.ts` (create), `overview-view.tsx` (create) + `overview-view.test.tsx`.
- `routes/_app.index.tsx` (rewrite) — wires hooks → `OverviewView`.
- `features/members/components/member-table.tsx` (rewrite) + `member-table.test.tsx` (create).
- `features/allies/components/ally-table.tsx` (rewrite) + `ally-table.test.tsx` (create).
- `routes/_app.members.tsx`, `routes/_app.allies.tsx` (modify) — page header + toolbar.
- `styles.css` (modify) — custom scrollbar only.

---

## Task 1: Status color tokens + animations (`@luminova/ui` theme)

**Files:**
- Modify: `packages/ui/src/theme.css`

- [ ] **Step 1: Add tokens + animations**

In `packages/ui/src/theme.css`, inside the `@theme { … }` block, add after the `--color-ink-3` line:

```css
  /* Semantic status (validation/state — not brand palette) */
  --color-ok: #1f8a5b;
  --color-error: #c0392b;
  --color-warn: #8e7300;
  --color-teal-ink: #2e8c8c;
```

And add these animations after the existing `--animate-toast-in` keyframes block (still inside `@theme`):

```css
  --animate-skeleton: skeleton 1.3s ease-in-out infinite;
  --animate-rise: rise 560ms cubic-bezier(0.16, 1, 0.3, 1) both;

  @keyframes skeleton {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }
  @keyframes rise {
    from {
      transform: translateY(10px);
    }
    to {
      transform: none;
    }
  }
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm --filter @luminova/ui run typecheck`
Expected: PASS (no TS errors; CSS is not type-checked but the file must remain valid).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/theme.css
git commit -m "feat(ui): status color tokens + skeleton/rise animations"
```

---

## Task 2: Admin icons (`@luminova/ui`)

**Files:**
- Modify: `packages/ui/src/components/icons.tsx`

- [ ] **Step 1: Add admin glyphs**

In `packages/ui/src/components/icons.tsx`, add these entries to the `Icon` object (insert before the closing `} satisfies Record<string, IconFn>;`). Keep the trailing comma on the previous entry (`check`).

```tsx
  home: ({ s = 24 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  calendar: ({ s = 24 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  folder: ({ s = 24 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  ),
  handshake: ({ s = 24 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 8.5L9.7 6.2a2 2 0 00-2.8 0L3 10v6h2l3 3 2.5-2.5L13 19l2.5-2.5L18 18h3v-7l-3.5-3.5a2 2 0 00-2.8 0L12 9.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  megaphone: ({ s = 24 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10v4a1 1 0 001 1h2l9 4V5L7 9H5a1 1 0 00-1 1zM18 9a3 3 0 010 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  barChart: ({ s = 24 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20V10M10 20V4M16 20v-7M20 20H4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  settings: ({ s = 24 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 2.5l1.4 2.3 2.6-.5.6 2.6 2.4 1.1-1 2.5 1 2.5-2.4 1.1-.6 2.6-2.6-.5L12 21.5l-1.4-2.3-2.6.5-.6-2.6-2.4-1.1 1-2.5-1-2.5 2.4-1.1.6-2.6 2.6.5L12 2.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  ),
  bell: ({ s = 22 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 004 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  search: ({ s = 18 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  sidebarLeft: ({ s = 20 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 4v16" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  chevRight: ({ s = 16 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chevExpand: ({ s = 16 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 9l4-4 4 4M8 15l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  trendUp: ({ s = 16 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 17l6-6 4 4 6-7M14 8h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  trendDown: ({ s = 16 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7l6 6 4-4 6 7M14 16h6v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  plus: ({ s = 18 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  download: ({ s = 18 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v10m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  logout: ({ s = 18 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 8l-4 4 4 4M6 12h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @luminova/ui run typecheck`
Expected: PASS — the `satisfies Record<string, IconFn>` still holds.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/icons.tsx
git commit -m "feat(ui): admin icon set (home, calendar, bell, chart, trends, …)"
```

---

## Task 3: Badge component (`@luminova/ui`)

**Files:**
- Create: `packages/ui/src/components/badge.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create the component**

`packages/ui/src/components/badge.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type BadgeTone = "blue" | "teal" | "green" | "amber" | "red" | "gray" | "navy";

const TONE: Record<BadgeTone, string> = {
  blue: "bg-jci-blue/12 text-jci-blue",
  teal: "bg-jci-teal/18 text-teal-ink",
  green: "bg-ok/14 text-ok",
  amber: "bg-jci-yellow/20 text-warn",
  red: "bg-error/12 text-error",
  gray: "bg-ink-1/[0.05] text-ink-3",
  navy: "bg-jci-navy/12 text-jci-navy",
};

export function Badge({
  tone = "gray",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Export it**

In `packages/ui/src/index.ts`, add after the `Button` export line:

```ts
export { Badge, type BadgeTone } from "./components/badge";
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @luminova/ui run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/badge.tsx packages/ui/src/index.ts
git commit -m "feat(ui): Badge status pill with tone variants"
```

---

## Task 4: Sparkline (pure helper + component)

**Files:**
- Create: `packages/ui/src/components/sparkline.ts`
- Create: `packages/ui/src/components/sparkline.test.ts`
- Create: `packages/ui/src/components/sparkline.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/components/sparkline.test.ts`:

```ts
import { expect, test } from "vitest";
import { sparklinePoints } from "./sparkline.js";

test("maps values into the box, flipping Y so larger values sit higher", () => {
  const pts = sparklinePoints([0, 10], 100, 40, 0);
  expect(pts).toEqual([
    { x: 0, y: 40 },
    { x: 100, y: 0 },
  ]);
});

test("a flat series renders along the vertical midline", () => {
  const pts = sparklinePoints([5, 5, 5], 80, 20, 0);
  expect(pts.map((p) => p.y)).toEqual([10, 10, 10]);
  expect(pts.map((p) => p.x)).toEqual([0, 40, 80]);
});

test("padding insets the drawable area", () => {
  const pts = sparklinePoints([0, 10], 100, 40, 4);
  expect(pts[0]).toEqual({ x: 4, y: 36 });
  expect(pts[1]).toEqual({ x: 96, y: 4 });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --filter @luminova/ui exec vitest run src/components/sparkline.test.ts`
Expected: FAIL — `sparkline.js` not found / `sparklinePoints` undefined.

- [ ] **Step 3: Implement the helper**

`packages/ui/src/components/sparkline.ts`:

```ts
export interface Point {
  x: number;
  y: number;
}

/** Map a number series into a w×h box. Y is flipped so larger values sit higher.
 *  A flat series is centered vertically. `pad` insets all edges. */
export function sparklinePoints(values: number[], w: number, h: number, pad = 2): Point[] {
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  return values.map((v, i) => {
    const x = n === 1 ? pad + innerW / 2 : pad + (innerW * i) / (n - 1);
    const t = span === 0 ? 0.5 : (v - min) / span;
    const y = pad + innerH * (1 - t);
    return { x, y };
  });
}

export function pointsToPath(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @luminova/ui exec vitest run src/components/sparkline.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the component**

`packages/ui/src/components/sparkline.tsx`:

```tsx
import { sparklinePoints, pointsToPath } from "./sparkline";

export function Sparkline({
  values,
  width = 84,
  height = 34,
  className,
  strokeWidth = 1.8,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  strokeWidth?: number;
}) {
  if (values.length < 2) return null;
  const d = pointsToPath(sparklinePoints(values, width, height, 3));
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d={d}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 6: Export it**

In `packages/ui/src/index.ts`, add:

```ts
export { Sparkline } from "./components/sparkline";
```

- [ ] **Step 7: Verify typecheck**

Run: `pnpm --filter @luminova/ui run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/sparkline.ts packages/ui/src/components/sparkline.test.ts packages/ui/src/components/sparkline.tsx packages/ui/src/index.ts
git commit -m "feat(ui): Sparkline with unit-tested geometry helper"
```

---

## Task 5: LineChart (pure geometry + dual-series component)

**Files:**
- Create: `packages/ui/src/components/line-chart.ts`
- Create: `packages/ui/src/components/line-chart.test.ts`
- Create: `packages/ui/src/components/line-chart.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/components/line-chart.test.ts`:

```ts
import { expect, test } from "vitest";
import { scaleY, seriesPath, areaPath } from "./line-chart.js";

test("scaleY flips a value within [min,max] to pixel space", () => {
  expect(scaleY(10, 0, 10, 100)).toBe(0);
  expect(scaleY(0, 0, 10, 100)).toBe(100);
  expect(scaleY(5, 0, 10, 100)).toBe(50);
});

test("scaleY centers a degenerate range", () => {
  expect(scaleY(5, 5, 5, 80)).toBe(40);
});

test("seriesPath spaces points evenly across the width", () => {
  const d = seriesPath([0, 10], 100, 100, 0, 10);
  expect(d).toBe("M0.00 100.00 L100.00 0.00");
});

test("areaPath closes the line down to the baseline", () => {
  const d = areaPath([0, 10], 100, 100, 0, 10);
  expect(d.startsWith("M0.00 100.00 L100.00 0.00")).toBe(true);
  expect(d.endsWith("L100.00 100.00 L0.00 100.00 Z")).toBe(true);
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --filter @luminova/ui exec vitest run src/components/line-chart.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement geometry helpers**

`packages/ui/src/components/line-chart.ts`:

```ts
export function scaleY(value: number, min: number, max: number, h: number): number {
  const span = max - min;
  const t = span === 0 ? 0.5 : (value - min) / span;
  return Number((h * (1 - t)).toFixed(10));
}

function xAt(i: number, n: number, w: number): number {
  return n <= 1 ? 0 : (w * i) / (n - 1);
}

export function seriesPath(values: number[], w: number, h: number, min: number, max: number): string {
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i, values.length, w).toFixed(2)} ${scaleY(v, min, max, h).toFixed(2)}`)
    .join(" ");
}

export function areaPath(values: number[], w: number, h: number, min: number, max: number): string {
  const line = seriesPath(values, w, h, min, max);
  return `${line} L${w.toFixed(2)} ${h.toFixed(2)} L0.00 ${h.toFixed(2)} Z`;
}

export interface ChartSeries {
  label: string;
  color: string;
  values: number[];
}

/** Shared min/max across all series so they sit on one Y scale, with a small pad. */
export function sharedDomain(series: ChartSeries[]): { min: number; max: number } {
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.1 || 1;
  return { min: lo - pad, max: hi + pad };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @luminova/ui exec vitest run src/components/line-chart.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Create the component**

`packages/ui/src/components/line-chart.tsx`:

```tsx
import { useId, useState, type PointerEvent as ReactPointerEvent } from "react";
import { areaPath, seriesPath, sharedDomain, type ChartSeries } from "./line-chart";

const W = 720;
const H = 300;

export function LineChart({
  series,
  height = 300,
  className,
}: {
  series: ChartSeries[];
  height?: number;
  className?: string;
}) {
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (series.length === 0) return null;
  const { min, max } = sharedDomain(series);
  const primary = series[0];
  const n = primary.values.length;

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))));
  };

  const hx = hover === null || n <= 1 ? 0 : (W * hover) / (n - 1);

  return (
    <div className={className} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Gráfico de ${series.map((s) => s.label).join(" y ")}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primary.color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={primary.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath(primary.values, W, H, min, max)} fill={`url(#${gradId})`} />
        {series.map((s) => (
          <path
            key={s.label}
            d={seriesPath(s.values, W, H, min, max)}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {hover !== null && (
          <line x1={hx} y1="0" x2={hx} y2={H} stroke="currentColor" strokeOpacity="0.18" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-[10px] bg-jci-black px-3 py-2 text-[12px] text-white shadow-lg"
          style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%`, top: 0 }}
        >
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-2 whitespace-nowrap">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              <span className="text-white/70">{s.label}</span>
              <span className="ml-auto font-bold tabular-nums">{s.values[hover]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Export it**

In `packages/ui/src/index.ts`, add:

```ts
export { LineChart } from "./components/line-chart";
export type { ChartSeries } from "./components/line-chart";
```

- [ ] **Step 7: Verify typecheck**

Run: `pnpm --filter @luminova/ui run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/line-chart.ts packages/ui/src/components/line-chart.test.ts packages/ui/src/components/line-chart.tsx packages/ui/src/index.ts
git commit -m "feat(ui): dependency-free dual-series LineChart with unit-tested geometry"
```

---

## Task 6: KpiCard, Skeleton, EmptyState (`@luminova/ui`)

**Files:**
- Create: `packages/ui/src/components/kpi-card.tsx`, `skeleton.tsx`, `empty-state.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create Skeleton**

`packages/ui/src/components/skeleton.tsx`:

```tsx
import { cn } from "../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[8px] bg-[length:200%_100%] bg-gradient-to-r from-ink-1/[0.04] via-line to-ink-1/[0.04] animate-skeleton motion-reduce:animate-none",
        className,
      )}
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 2: Create EmptyState**

`packages/ui/src/components/empty-state.tsx`:

```tsx
import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <h3 className="text-[17px] font-semibold text-ink-1">{title}</h3>
      {description && <p className="mt-1 mb-4 max-w-[360px] text-[14px] leading-relaxed text-ink-3">{description}</p>}
      {action}
    </div>
  );
}
```

- [ ] **Step 3: Create KpiCard**

`packages/ui/src/components/kpi-card.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./icons";
import { Sparkline } from "./sparkline";

export type KpiTone = "blue" | "teal" | "navy" | "amber";

const TILE: Record<KpiTone, string> = {
  blue: "bg-jci-blue/10 text-jci-blue",
  teal: "bg-jci-teal/16 text-teal-ink",
  navy: "bg-jci-navy/12 text-jci-navy",
  amber: "bg-jci-yellow/18 text-warn",
};

const SPARK: Record<KpiTone, string> = {
  blue: "text-jci-blue",
  teal: "text-teal-ink",
  navy: "text-jci-navy",
  amber: "text-warn",
};

export interface KpiTrend {
  dir: "up" | "down" | "flat";
  label: string;
}

export function KpiCard({
  icon,
  tone = "blue",
  label,
  value,
  trend,
  spark,
}: {
  icon: ReactNode;
  tone?: KpiTone;
  label: string;
  value: ReactNode;
  trend?: KpiTrend;
  spark?: number[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-[18px] shadow-[0_1px_2px_rgba(19,15,45,0.05)] transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_18px_40px_-24px_rgba(19,15,45,0.22)]">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex size-[38px] shrink-0 items-center justify-center rounded-[11px]", TILE[tone])}>
          {icon}
        </span>
        <span className="text-[13px] font-medium leading-tight text-ink-3">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2.5">
        <span className="text-[34px] font-normal leading-none tracking-[-0.03em] text-ink-1 tabular-nums">{value}</span>
        {spark && <Sparkline values={spark} className={SPARK[tone]} />}
      </div>
      {trend && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[12.5px] font-semibold",
            trend.dir === "up" && "text-ok",
            trend.dir === "down" && "text-error",
            trend.dir === "flat" && "text-ink-3",
          )}
        >
          {trend.dir === "up" && Icon.trendUp({ s: 14 })}
          {trend.dir === "down" && Icon.trendDown({ s: 14 })}
          {trend.label}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Export all three**

In `packages/ui/src/index.ts`, add:

```ts
export { KpiCard, type KpiTone, type KpiTrend } from "./components/kpi-card";
export { Skeleton } from "./components/skeleton";
export { EmptyState } from "./components/empty-state";
```

- [ ] **Step 5: Verify the whole ui package**

Run: `pnpm --filter @luminova/ui run ci`
Expected: PASS (eslint + tsc + vitest, including the sparkline/line-chart tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/kpi-card.tsx packages/ui/src/components/skeleton.tsx packages/ui/src/components/empty-state.tsx packages/ui/src/index.ts
git commit -m "feat(ui): KpiCard, Skeleton, EmptyState primitives"
```

---

## Task 7: Sidebar nav config (pure, backstage)

**Files:**
- Create: `apps/backstage/src/components/nav-config.ts`
- Create: `apps/backstage/src/components/nav-config.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backstage/src/components/nav-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NAV_GROUPS, navItemForPath } from "./nav-config";

describe("nav-config", () => {
  it("only lists routes that exist today", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to));
    expect(paths).toEqual(["/", "/members", "/allies"]);
  });

  it("groups items under Panel and Gestión labels", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Panel", "Gestión"]);
  });

  it("resolves the active item by exact path", () => {
    expect(navItemForPath("/")?.label).toBe("Inicio");
    expect(navItemForPath("/members")?.label).toBe("Miembros");
    expect(navItemForPath("/unknown")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --filter backstage exec vitest run src/components/nav-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/backstage/src/components/nav-config.ts`:

```ts
import type { Icon } from "@luminova/ui";

type IconKey = keyof typeof Icon;

export interface NavItem {
  to: "/" | "/members" | "/allies";
  label: string;
  icon: IconKey;
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { label: "Panel", items: [{ to: "/", label: "Inicio", icon: "home", exact: true }] },
  {
    label: "Gestión",
    items: [
      { to: "/members", label: "Miembros", icon: "user" },
      { to: "/allies", label: "Aliados", icon: "handshake" },
    ],
  },
];

export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_GROUPS.flatMap((g) => g.items).find((i) =>
    i.exact ? pathname === i.to : pathname.startsWith(i.to),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/components/nav-config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/components/nav-config.ts apps/backstage/src/components/nav-config.test.ts
git commit -m "feat(backstage): pure sidebar nav config"
```

---

## Task 8: Sidebar rewrite (backstage)

**Files:**
- Rewrite: `apps/backstage/src/components/app-sidebar.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `apps/backstage/src/components/app-sidebar.tsx`:

```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import { Icon, LogoLockup } from "@luminova/ui";
import { useAuth } from "../lib/auth/auth";
import { signOutUser } from "../lib/auth/sign-out";
import { NAV_GROUPS } from "./nav-config";

function initials(value: string): string {
  const parts = value.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function AppSidebar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const label = user?.email ?? "—";

  const onLogout = async () => {
    await signOutUser();
    await navigate({ to: "/login" });
  };

  return (
    <aside className="flex h-dvh w-[264px] flex-col border-r border-line bg-surface">
      <div className="flex h-16 shrink-0 items-center border-b border-line px-[18px]">
        <LogoLockup size="sm" />
      </div>

      <nav className="scroll flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="contents">
            <div className="px-3 pt-4 pb-2 font-mono text-[10px] tracking-[0.16em] text-ink-3 uppercase">
              {group.label}
            </div>
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact ?? false }}
                className="group relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-medium text-ink-2 transition-colors hover:bg-ink-1/[0.04] hover:text-ink-1 [&.active]:bg-jci-blue/10 [&.active]:font-semibold [&.active]:text-jci-blue"
              >
                <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-jci-blue opacity-0 transition-opacity group-[.active]:opacity-100" />
                <span className="flex size-[22px] shrink-0 items-center justify-center">
                  {Icon[item.icon]({ s: 21 })}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-[11px] p-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-jci-navy text-[13px] font-semibold text-white">
            {initials(label)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-ink-1">{label}</div>
            <button
              type="button"
              onClick={onLogout}
              className="text-[11.5px] text-ink-3 transition-colors hover:text-error"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter backstage run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backstage/src/components/app-sidebar.tsx
git commit -m "feat(backstage): grouped sidebar with active rail + user footer"
```

---

## Task 9: Topbar breadcrumb helper + component (backstage)

**Files:**
- Create: `apps/backstage/src/components/breadcrumb.ts`
- Create: `apps/backstage/src/components/breadcrumb.test.ts`
- Create: `apps/backstage/src/components/app-topbar.tsx`

- [ ] **Step 1: Write the failing test**

`apps/backstage/src/components/breadcrumb.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sectionTitle } from "./breadcrumb";

describe("sectionTitle", () => {
  it("returns the nav label for a known path", () => {
    expect(sectionTitle("/")).toBe("Inicio");
    expect(sectionTitle("/members")).toBe("Miembros");
    expect(sectionTitle("/allies")).toBe("Aliados");
  });

  it("falls back to empty string for unknown paths", () => {
    expect(sectionTitle("/nope")).toBe("");
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --filter backstage exec vitest run src/components/breadcrumb.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

`apps/backstage/src/components/breadcrumb.ts`:

```ts
import { navItemForPath } from "./nav-config";

export function sectionTitle(pathname: string): string {
  return navItemForPath(pathname)?.label ?? "";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/components/breadcrumb.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the topbar**

`apps/backstage/src/components/app-topbar.tsx`:

```tsx
import { useLocation } from "@tanstack/react-router";
import { Icon } from "@luminova/ui";
import { sectionTitle } from "./breadcrumb";

export function AppTopbar() {
  const { pathname } = useLocation();
  const current = sectionTitle(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-[18px] border-b border-line bg-surface/80 px-7 backdrop-blur-[10px] backdrop-saturate-150">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-[13.5px] font-medium text-ink-3">Backstage</span>
        <span className="text-ink-3">{Icon.chevRight({ s: 14 })}</span>
        <span className="text-[14.5px] font-semibold text-ink-1">{current}</span>
      </div>
      <div className="flex-1" />
      <div
        className="flex h-[38px] w-[268px] items-center gap-2.5 rounded-[10px] border border-line bg-surface-2 px-3 text-ink-3"
        aria-hidden="true"
      >
        {Icon.search({ s: 17 })}
        <span className="flex-1 text-[13.5px]">Buscar en Backstage…</span>
        <kbd className="rounded-[6px] border border-line-strong px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3">
          ⌘K
        </kbd>
      </div>
      <button
        type="button"
        className="flex size-[38px] items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-ink-1/[0.04] hover:text-ink-1"
        aria-label="Notificaciones"
      >
        {Icon.bell({ s: 20 })}
      </button>
    </header>
  );
}
```

- [ ] **Step 6: Verify typecheck**

Run: `pnpm --filter backstage run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backstage/src/components/breadcrumb.ts apps/backstage/src/components/breadcrumb.test.ts apps/backstage/src/components/app-topbar.tsx
git commit -m "feat(backstage): topbar with breadcrumb + search affordance"
```

---

## Task 10: Shell layout (backstage `_app.tsx` + scrollbar CSS)

**Files:**
- Rewrite: `apps/backstage/src/routes/_app.tsx`
- Modify: `apps/backstage/src/styles.css`

- [ ] **Step 1: Add custom scrollbar styling**

Append to `apps/backstage/src/styles.css` (after the `@layer base { … }` block):

```css
@layer utilities {
  .scroll::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  .scroll::-webkit-scrollbar-thumb {
    background: var(--color-line-strong);
    border-radius: 99px;
    border: 3px solid transparent;
    background-clip: padding-box;
  }
  .scroll::-webkit-scrollbar-thumb:hover {
    background: var(--color-ink-3);
    background-clip: padding-box;
  }
}
```

- [ ] **Step 2: Rewrite the layout**

In `apps/backstage/src/routes/_app.tsx`, add to the imports at the top (after the `AppSidebar` import):

```tsx
import { AppTopbar } from "../components/app-topbar";
```

Replace the `AppLayout` function body:

```tsx
function AppLayout() {
  return (
    <div className="grid h-dvh grid-cols-[264px_1fr] bg-surface-2">
      <AppSidebar />
      <div className="flex min-w-0 flex-col">
        <AppTopbar />
        <main className="scroll flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1320px] px-7 pt-[30px] pb-20">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter backstage run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backstage/src/routes/_app.tsx apps/backstage/src/styles.css
git commit -m "feat(backstage): app shell grid (sidebar + sticky topbar + scroll content)"
```

---

## Task 11: Overview mock data module (backstage)

**Files:**
- Create: `apps/backstage/src/components/overview/overview-mock.ts`

- [ ] **Step 1: Create the mock module**

`apps/backstage/src/components/overview/overview-mock.ts`:

```ts
// ⚠️ MOCK DATA — placeholder content for Overview widgets that have no backend yet
// (events, projects, tasks, attendance history, activity feed). Real Members/Allies
// counts come from useMembers/useAllies in the route, NOT from here. Replace each
// block when its backend lands. Do not treat these numbers as real.

import type { ChartSeries } from "@luminova/ui";

export const OVERVIEW_MOCK = {
  kpis: {
    upcomingEvents: { value: 6, trend: { dir: "up", label: "+2 · vs. mes anterior" } as const, spark: [3, 4, 4, 5, 4, 6, 6] },
    activeProjects: { value: 4, trend: { dir: "flat", label: "Sin cambios" } as const, spark: [4, 4, 5, 4, 4, 4, 4] },
    pendingTasks: { value: 12, trend: { dir: "down", label: "−3 · esta semana" } as const, spark: [18, 16, 15, 14, 13, 12, 12] },
  },
  membersTrendSpark: [120, 124, 128, 130, 134, 138, 142],
  alliesTrendSpark: [3, 4, 4, 5, 5, 6, 6],
  chart: [
    { label: "Miembros activos", color: "#0097D7", values: [116, 120, 119, 124, 128, 127, 132, 136, 134, 139, 141, 142] },
    { label: "Asistencia a eventos", color: "#57BCBC", values: [128, 142, 138, 130, 126, 148, 150, 140, 152, 149, 155, 158] },
  ] satisfies ChartSeries[],
  upcomingEvents: [
    { id: "e1", month: "JUN", day: "14", title: "Asamblea General Ordinaria", time: "19:00", place: "Sede JCI · Equipetrol", status: { tone: "green", label: "Confirmado" } as const },
    { id: "e2", month: "JUN", day: "21", title: "Capacitación: Liderazgo Consciente", time: "09:00", place: "Hotel Los Tajibos", status: { tone: "blue", label: "Inscripciones abiertas" } as const },
    { id: "e3", month: "JUN", day: "28", title: "Proyecto Sonrisas — Jornada", time: "08:30", place: "Plan 3000", status: { tone: "amber", label: "Planificación" } as const },
  ],
  activity: [
    { id: "a1", tone: "blue" as const, segments: [{ text: "Camila Áñez", strong: true }, { text: " creó el evento " }, { text: "Asamblea General", strong: true }], time: "Hace 2 h" },
    { id: "a2", tone: "teal" as const, segments: [{ text: "Sergio Roca", strong: true }, { text: " se unió como nuevo miembro" }], time: "Hace 5 h" },
    { id: "a3", tone: "green" as const, segments: [{ text: "Proyecto " }, { text: "Sonrisas", strong: true }, { text: " avanzó a " }, { text: "70%", strong: true }], time: "Ayer" },
  ],
  quickActions: [
    { id: "q1", icon: "plus", title: "Crear evento", desc: "Programa una nueva actividad del capítulo" },
    { id: "q2", icon: "user", title: "Invitar miembro", desc: "Suma a alguien a la membresía activa" },
    { id: "q3", icon: "handshake", title: "Registrar aliado", desc: "Añade una empresa u organización aliada" },
    { id: "q4", icon: "barChart", title: "Ver reportes", desc: "Indicadores y exportes del capítulo" },
  ],
} as const;
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter backstage run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backstage/src/components/overview/overview-mock.ts
git commit -m "feat(backstage): Overview mock-data module (clearly flagged)"
```

---

## Task 12: Overview view (presentational) + tests (backstage)

**Files:**
- Create: `apps/backstage/src/components/overview/overview-view.tsx`
- Create: `apps/backstage/src/components/overview/overview-view.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/backstage/src/components/overview/overview-view.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverviewView } from "./overview-view";

describe("OverviewView", () => {
  it("renders real member and ally counts in the KPI row", () => {
    render(<OverviewView memberCount={142} allyCount={6} userName="Camila Áñez" />);
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("Miembros activos")).toBeInTheDocument();
    expect(screen.getByText("Aliados")).toBeInTheDocument();
  });

  it("greets the user by first name", () => {
    render(<OverviewView memberCount={0} allyCount={0} userName="Camila Áñez" />);
    expect(screen.getByRole("heading", { name: /camila/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --filter backstage exec vitest run src/components/overview/overview-view.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the view**

`apps/backstage/src/components/overview/overview-view.tsx`:

```tsx
import { Badge, Button, Icon, KpiCard, LineChart, type BadgeTone } from "@luminova/ui";
import { OVERVIEW_MOCK } from "./overview-mock";

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] ?? value;
}

const ACTIVITY_DOT: Record<string, string> = {
  blue: "bg-jci-blue/12 text-jci-blue",
  teal: "bg-jci-teal/16 text-teal-ink",
  green: "bg-ok/14 text-ok",
};

export function OverviewView({
  memberCount,
  allyCount,
  userName,
}: {
  memberCount: number;
  allyCount: number;
  userName: string;
}) {
  const m = OVERVIEW_MOCK;
  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="mb-2.5 font-mono text-[11px] tracking-[0.14em] text-jci-blue uppercase">
            Inicio
          </div>
          <h1 className="text-[30px] font-normal leading-tight tracking-[-0.02em] text-ink-1">
            Hola, {firstName(userName)}
          </h1>
          <p className="mt-2 text-[14.5px] text-ink-3">Esto es lo que necesita tu atención hoy.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button as="button" type="button" variant="secondary" size="sm" iconLeft={Icon.user({ s: 18 })}>
            Invitar miembro
          </Button>
          <Button as="button" type="button" size="sm" iconLeft={Icon.plus({ s: 18 })}>
            Crear evento
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={Icon.user({ s: 20 })} tone="blue" label="Miembros activos" value={memberCount} trend={{ dir: "up", label: "+8 · este trimestre" }} spark={[...m.membersTrendSpark]} />
        <KpiCard icon={Icon.calendar({ s: 20 })} tone="teal" label="Próximos eventos" value={m.kpis.upcomingEvents.value} trend={m.kpis.upcomingEvents.trend} spark={[...m.kpis.upcomingEvents.spark]} />
        <KpiCard icon={Icon.handshake({ s: 20 })} tone="navy" label="Aliados" value={allyCount} trend={{ dir: "up", label: "+1 · este mes" }} spark={[...m.alliesTrendSpark]} />
        <KpiCard icon={Icon.check({ s: 20 })} tone="amber" label="Tareas pendientes" value={m.kpis.pendingTasks.value} trend={m.kpis.pendingTasks.trend} spark={[...m.kpis.pendingTasks.spark]} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.62fr_1fr]">
        <div className="flex flex-col gap-5">
          <section className="rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(19,15,45,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-4 px-[22px] pt-5 pb-4">
              <div>
                <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink-1">Membresía y asistencia</h2>
                <p className="text-[12.5px] text-ink-3">Miembros activos vs. asistentes a eventos</p>
              </div>
              <div className="flex items-center gap-4">
                {m.chart.map((s) => (
                  <span key={s.label} className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
                    <span className="h-[3px] w-[18px] rounded" style={{ background: s.color }} />
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="px-[22px] pb-[22px] text-jci-black">
              <LineChart series={m.chart.map((s) => ({ ...s, values: [...s.values] }))} height={280} />
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <section className="rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(19,15,45,0.05)]">
            <div className="flex items-center justify-between px-[22px] pt-5 pb-2">
              <h2 className="text-[16px] font-semibold text-ink-1">Próximos eventos</h2>
              <span className="text-[13px] font-semibold text-jci-blue">Ver todos</span>
            </div>
            <div className="px-3 pb-3">
              {m.upcomingEvents.map((e) => (
                <div key={e.id} className="flex items-center gap-4 rounded-[12px] px-3 py-3.5 transition-colors hover:bg-ink-1/[0.04]">
                  <div className="flex size-[52px] shrink-0 flex-col items-center justify-center rounded-[11px] border border-line bg-surface-2">
                    <span className="text-[10px] font-bold tracking-[0.1em] text-jci-blue uppercase">{e.month}</span>
                    <span className="text-[21px] font-medium leading-none tracking-[-0.02em] text-ink-1">{e.day}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-semibold text-ink-1">{e.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                      <span>{e.time}</span>
                      <span className="size-[3px] rounded-full bg-ink-3" />
                      <span>{e.place}</span>
                    </div>
                  </div>
                  <Badge tone={e.status.tone as BadgeTone} dot>{e.status.label}</Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[16px] border border-line bg-surface px-[22px] py-5 shadow-[0_1px_2px_rgba(19,15,45,0.05)]">
            <h2 className="mb-4 text-[16px] font-semibold text-ink-1">Actividad reciente</h2>
            <div className="flex flex-col gap-4">
              {m.activity.map((a) => (
                <div key={a.id} className="flex gap-3.5">
                  <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${ACTIVITY_DOT[a.tone]}`}>
                    {Icon.bell({ s: 15 })}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13.5px] leading-snug text-ink-2">
                      {a.segments.map((seg, i) =>
                        seg.strong ? (
                          <b key={i} className="font-semibold text-ink-1">{seg.text}</b>
                        ) : (
                          <span key={i}>{seg.text}</span>
                        ),
                      )}
                    </div>
                    <div className="mt-1 text-[11.5px] text-ink-3 tabular-nums">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-[16px] font-semibold text-ink-1">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {m.quickActions.map((q) => (
            <button key={q.id} type="button" className="group flex flex-col items-start gap-3.5 rounded-[14px] border border-line bg-surface p-[18px] text-left shadow-[0_1px_2px_rgba(19,15,45,0.05)] transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_18px_40px_-24px_rgba(19,15,45,0.22)]">
              <span className="flex size-[42px] items-center justify-center rounded-[12px] bg-jci-blue/10 text-jci-blue">
                {Icon[q.icon as keyof typeof Icon]({ s: 21 })}
              </span>
              <span>
                <span className="block text-[14px] font-semibold text-ink-1">{q.title}</span>
                <span className="mt-1 block text-[12.5px] leading-snug text-ink-3">{q.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/components/overview/overview-view.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/components/overview/overview-view.tsx apps/backstage/src/components/overview/overview-view.test.tsx
git commit -m "feat(backstage): Overview view (KPIs, chart, events, activity, quick actions)"
```

---

## Task 13: Wire Overview into the dashboard route (backstage)

**Files:**
- Rewrite: `apps/backstage/src/routes/_app.index.tsx`

- [ ] **Step 1: Rewrite the route**

Replace the entire contents of `apps/backstage/src/routes/_app.index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@luminova/ui";
import { useAuth } from "../lib/auth/auth";
import { useMembers } from "../features/members/hooks/use-members";
import { useAllies } from "../features/allies/hooks/use-allies";
import { OverviewView } from "../components/overview/overview-view";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const members = useMembers();
  const allies = useAllies();

  if (members.isLoading || allies.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px]" />
        ))}
      </div>
    );
  }

  const memberCount = members.data?.filter((m) => m.active).length ?? 0;
  const allyCount = allies.data?.length ?? 0;

  return (
    <OverviewView
      memberCount={memberCount}
      allyCount={allyCount}
      userName={user?.email ?? "—"}
    />
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter backstage run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backstage/src/routes/_app.index.tsx
git commit -m "feat(backstage): wire real member/ally counts into Overview"
```

---

## Task 14: Restyle Members table (backstage)

**Files:**
- Rewrite: `apps/backstage/src/features/members/components/member-table.tsx`
- Create: `apps/backstage/src/features/members/components/member-table.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/backstage/src/features/members/components/member-table.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Timestamp } from "firebase/firestore";
import { MemberTable } from "./member-table";
import type { Member } from "../types/member";

const member: Member = {
  id: "m1",
  name: "Ana Pérez",
  email: "ana@jci.bo",
  role: "Presidenta",
  joinDate: Timestamp.fromDate(new Date("2021-03-01T00:00:00Z")),
  birthdate: Timestamp.fromDate(new Date("1992-07-01T00:00:00Z")),
  status: "Activo",
  profilePicture: null,
  totalPoints: 0,
  active: true,
  deletedAt: null,
};

describe("MemberTable", () => {
  it("renders the status as a badge and a name", () => {
    render(<MemberTable members={[member]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("calls onEdit when the edit action is used", async () => {
    const onEdit = vi.fn();
    render(<MemberTable members={[member]} onEdit={onEdit} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /editar a ana pérez/i }));
    expect(onEdit).toHaveBeenCalledWith(member);
  });

  it("shows an empty state when there are no members", () => {
    render(<MemberTable members={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/no hay miembros/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --filter backstage exec vitest run src/features/members/components/member-table.test.tsx`
Expected: FAIL — current table has no accessible "Editar a Ana Pérez" button and no "No hay miembros" empty-state copy.

- [ ] **Step 3: Rewrite the table**

Replace the entire contents of `apps/backstage/src/features/members/components/member-table.tsx`:

```tsx
import {
  Badge,
  EmptyState,
  Icon,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  type BadgeTone,
} from "@luminova/ui";
import type { Member, MemberStatus } from "../types/member";
import { dateInputValue } from "../repositories/member-mapper";

interface MemberTableProps {
  members: Member[];
  onEdit: (member: Member) => void;
  onDelete: (member: Member) => void;
}

const STATUS_TONE: Record<MemberStatus, BadgeTone> = {
  Activo: "green",
  Inactivo: "gray",
  Desafiliado: "red",
};

export function MemberTable({ members, onEdit, onDelete }: MemberTableProps) {
  if (members.length === 0) {
    return (
      <EmptyState
        icon={Icon.user({ s: 40 })}
        title="No hay miembros todavía"
        description="Cuando agregues miembros del capítulo, aparecerán aquí."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Miembro</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Ingreso</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-jci-navy text-[12px] font-semibold text-white">
                  {member.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink-1">{member.name}</div>
                  <div className="truncate text-[12px] text-ink-3">{member.email}</div>
                </div>
              </div>
            </TableCell>
            <TableCell className="text-ink-2">{member.role}</TableCell>
            <TableCell>
              {member.status ? (
                <Badge tone={STATUS_TONE[member.status]} dot>
                  {member.status}
                </Badge>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="text-ink-2 tabular-nums">
              {member.joinDate ? dateInputValue(member.joinDate) : "—"}
            </TableCell>
            <TableCell className="text-right">
              <div className="inline-flex gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(member)}
                  aria-label={`Editar a ${member.name}`}
                  className="flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-colors hover:bg-ink-1/[0.04] hover:text-ink-1"
                >
                  {Icon.settings({ s: 17 })}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(member)}
                  aria-label={`Eliminar a ${member.name}`}
                  className="flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-colors hover:bg-error/10 hover:text-error"
                >
                  {Icon.close({ s: 17 })}
                </button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/members/components/member-table.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/members/components/member-table.tsx apps/backstage/src/features/members/components/member-table.test.tsx
git commit -m "feat(backstage): restyle members table (badge status + icon row actions)"
```

---

## Task 15: Restyle Allies table (backstage)

**Files:**
- Rewrite: `apps/backstage/src/features/allies/components/ally-table.tsx`
- Create: `apps/backstage/src/features/allies/components/ally-table.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/backstage/src/features/allies/components/ally-table.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AllyTable } from "./ally-table";
import type { Ally } from "../types/ally";

const ally: Ally = {
  id: "a1",
  companyName: "Equipetrol SRL",
  personInCharge: "Mario Suárez",
  phone: "+591 700 00000",
  email: "mario@equipetrol.bo",
} as Ally;

describe("AllyTable", () => {
  it("renders the company name", () => {
    render(<AllyTable allies={[ally]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Equipetrol SRL")).toBeInTheDocument();
  });

  it("calls onDelete when the delete action is used", async () => {
    const onDelete = vi.fn();
    render(<AllyTable allies={[ally]} onEdit={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /eliminar a equipetrol srl/i }));
    expect(onDelete).toHaveBeenCalledWith(ally);
  });

  it("shows an empty state when there are no allies", () => {
    render(<AllyTable allies={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/no hay aliados/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --filter backstage exec vitest run src/features/allies/components/ally-table.test.tsx`
Expected: FAIL — no accessible "Eliminar a Equipetrol SRL" button / no empty-state copy.

- [ ] **Step 3: Rewrite the table**

Replace the entire contents of `apps/backstage/src/features/allies/components/ally-table.tsx`:

```tsx
import {
  EmptyState,
  Icon,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@luminova/ui";
import type { Ally } from "../types/ally";

interface AllyTableProps {
  allies: Ally[];
  onEdit: (ally: Ally) => void;
  onDelete: (ally: Ally) => void;
}

export function AllyTable({ allies, onEdit, onDelete }: AllyTableProps) {
  if (allies.length === 0) {
    return (
      <EmptyState
        icon={Icon.handshake({ s: 40 })}
        title="No hay aliados todavía"
        description="Registra empresas y organizaciones aliadas para verlas aquí."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Empresa</TableHead>
          <TableHead>Encargado</TableHead>
          <TableHead>Teléfono</TableHead>
          <TableHead>Correo</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {allies.map((ally) => (
          <TableRow key={ally.id}>
            <TableCell className="font-semibold text-ink-1">{ally.companyName}</TableCell>
            <TableCell className="text-ink-2">{ally.personInCharge}</TableCell>
            <TableCell className="text-ink-2 tabular-nums">{ally.phone}</TableCell>
            <TableCell className="text-ink-2">{ally.email}</TableCell>
            <TableCell className="text-right">
              <div className="inline-flex gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(ally)}
                  aria-label={`Editar a ${ally.companyName}`}
                  className="flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-colors hover:bg-ink-1/[0.04] hover:text-ink-1"
                >
                  {Icon.settings({ s: 17 })}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(ally)}
                  aria-label={`Eliminar a ${ally.companyName}`}
                  className="flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-colors hover:bg-error/10 hover:text-error"
                >
                  {Icon.close({ s: 17 })}
                </button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/allies/components/ally-table.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/allies/components/ally-table.tsx apps/backstage/src/features/allies/components/ally-table.test.tsx
git commit -m "feat(backstage): restyle allies table (icon row actions + empty state)"
```

---

## Task 16: Page headers for Members & Allies routes (backstage)

**Files:**
- Modify: `apps/backstage/src/routes/_app.members.tsx`
- Modify: `apps/backstage/src/routes/_app.allies.tsx`

- [ ] **Step 1: Update the Members imports + header**

In `apps/backstage/src/routes/_app.members.tsx`, change the import line:

```tsx
import { Button, Sheet, Dialog } from "@luminova/ui";
```

to:

```tsx
import { Button, Sheet, Dialog, Icon } from "@luminova/ui";
```

Then replace the header + states block (from the opening `<div className="flex flex-col gap-6">` through the `{members && …}` line):

```tsx
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="mb-2.5 font-mono text-[11px] tracking-[0.14em] text-jci-blue uppercase">
            Gestión
          </div>
          <h1 className="text-[30px] font-normal leading-tight tracking-[-0.02em] text-ink-1">
            Miembros
          </h1>
          <p className="mt-2 text-[14.5px] text-ink-3">
            Gestiona la membresía activa del capítulo, roles y estados.
          </p>
        </div>
        <Button as="button" type="button" iconLeft={Icon.plus({ s: 18 })} onClick={() => setEditing("new")}>
          Agregar miembro
        </Button>
      </header>

      {isLoading && <p className="text-ink-2">Cargando…</p>}
      {isError && (
        <p role="alert" className="text-error">
          No se pudieron cargar los miembros.
        </p>
      )}
      {members && <MemberTable members={members} onEdit={setEditing} onDelete={setDeleteTarget} />}
```

- [ ] **Step 2: Update the Allies imports + header**

In `apps/backstage/src/routes/_app.allies.tsx`, change the import line:

```tsx
import { Button, Sheet, Dialog } from "@luminova/ui";
```

to:

```tsx
import { Button, Sheet, Dialog, Icon } from "@luminova/ui";
```

Then replace the header + states block (from the opening `<div className="flex flex-col gap-6">` through the `{allies && …}` line):

```tsx
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="mb-2.5 font-mono text-[11px] tracking-[0.14em] text-jci-blue uppercase">
            Gestión
          </div>
          <h1 className="text-[30px] font-normal leading-tight tracking-[-0.02em] text-ink-1">
            Aliados
          </h1>
          <p className="mt-2 text-[14.5px] text-ink-3">
            Empresas y organizaciones que apoyan al capítulo.
          </p>
        </div>
        <Button as="button" type="button" iconLeft={Icon.plus({ s: 18 })} onClick={() => setEditing("new")}>
          Agregar aliado
        </Button>
      </header>

      {isLoading && <p className="text-ink-2">Cargando…</p>}
      {isError && (
        <p role="alert" className="text-error">
          No se pudieron cargar los aliados.
        </p>
      )}
      {allies && <AllyTable allies={allies} onEdit={setEditing} onDelete={setDeleteTarget} />}
```

- [ ] **Step 3: Verify typecheck + tests**

Run: `pnpm --filter backstage run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backstage/src/routes/_app.members.tsx apps/backstage/src/routes/_app.allies.tsx
git commit -m "feat(backstage): page headers (eyebrow + title + sub) for members & allies"
```

---

## Task 17: Full verification + bundle check

**Files:** none (verification only)

- [ ] **Step 1: Run the ui package CI**

Run: `pnpm --filter @luminova/ui run ci`
Expected: PASS (eslint + tsc + vitest).

- [ ] **Step 2: Run the backstage CI**

Run: `pnpm --filter backstage run ci`
Expected: PASS (eslint + tsc + vite build + vitest). If knip/size-limit run at the repo root, also run: `pnpm pr-tests` and confirm PASS.

- [ ] **Step 3: Dispatch the bundle-budget-watcher subagent**

Use the Agent tool with `subagent_type: "bundle-budget-watcher"` and a prompt describing the change (new `@luminova/ui` primitives — Badge, KpiCard, Sparkline, LineChart, Skeleton, EmptyState, admin icons — plus the backstage shell + Overview). Address any size-limit breach or dead-export it reports. Every new `index.ts` export is consumed by backstage (Badge/KpiCard/Sparkline/LineChart/Skeleton/EmptyState), so knip should be clean.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `pnpm --filter backstage dev`, log in, and confirm: sidebar groups + active rail, topbar breadcrumb changes per route, Overview KPIs show real member/ally counts, chart hover tooltip works, Members/Allies tables show badges + icon actions + empty states.

- [ ] **Step 5: Final commit (if the watcher prompted fixes)**

```bash
git add -A
git commit -m "chore(backstage): address bundle-budget-watcher findings"
```

---

## Self-Review Notes

- **Spec coverage:** shell (Tasks 8–10), Overview real+mock (11–13), reusable primitives (1–6), tables restyle (14–15), page headers (16), light-only + no ⌘K (topbar search is inert, Task 9), dark-ready tokens (no hardcoded hex in components except chart series brand colors, which are intentional inline SVG fills), verification + bundle watcher (17). Nav = real routes only (Task 7).
- **No security trigger:** no auth/repository/firestore.rules files touched — confirmed against the file list.
- **No `dangerouslySetInnerHTML`:** the activity feed renders structured `segments` (text + `strong` flag), not raw HTML.
- **Type consistency:** `BadgeTone`, `KpiTone`, `KpiTrend`, `ChartSeries`, `NavItem`/`NavGroup`, `sectionTitle`, `navItemForPath`, `sparklinePoints`/`pointsToPath`, `scaleY`/`seriesPath`/`areaPath`/`sharedDomain` are each defined once and reused with identical names.
- **Mutable-array note:** `OVERVIEW_MOCK` is `as const` (readonly); the view spreads arrays (`[...spark]`, `values: [...s.values]`) before passing to components typed with mutable `number[]`, avoiding readonly-assignability errors.
- **knip:** every new ui export is consumed by backstage; pure helpers are consumed by their components and tests.
```