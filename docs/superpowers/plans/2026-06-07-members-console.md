# Members Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing `/members` CRUD into the full Miembros console — segmented status filter with live counts, active-filter chips, client pagination, a ⋯ context menu with lifecycle actions, a 2-mode view/edit drawer, a 3-stage invite flow that creates a real member and provisions app login, optimistic mutations, gender-aware toasts, and CSV export.

**Architecture:** Filtering (search + status) and the meta row live at the page level (`_app.members.tsx`); the table chrome (sorting, skeleton, empty, row actions) stays in the shared `DataTable`, which gains **optional, additive client pagination**. Pure logic (search/status filter, status counts, gender-aware copy, avatar color, CSV, page windowing) lives in tested `features/members/lib/*` modules. Mutations become optimistic in their hooks; a new `setStatus` repo method + `use-set-member-status` hook power activate/deactivate/disaffiliate. No `@luminova/types` or `firestore.rules` changes.

**Tech Stack:** React 19, TypeScript strict, TanStack Router + Query v5, RHF + Zod, `@luminova/ui` primitives, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-members-console-design.md`

---

## File Structure

**New — pure logic (TDD first):**
- `apps/backstage/src/features/members/lib/member-filter.ts` — `filterMembers`, `statusCounts`
- `apps/backstage/src/features/members/lib/member-display.ts` — `avatarColor`, `joinYear`, `actionMessage` (gender-aware)
- `apps/backstage/src/features/members/lib/member-csv.ts` — `membersToCsv`
- `apps/backstage/src/features/members/lib/role-suggestions.ts` — datalist option list
- `packages/ui/src/lib/page-window.ts` — `pageWindow(current, total)` windowed strip with `…`

**New — hooks:**
- `apps/backstage/src/features/members/hooks/use-set-member-status.ts`

**New — components:**
- `apps/backstage/src/features/members/components/member-row-menu.tsx` — Popover ⋯ menu
- `apps/backstage/src/features/members/components/member-drawer.tsx` — Sheet, Ver/Editar modes
- `apps/backstage/src/features/members/components/member-invite-drawer.tsx` — 3-stage
- `apps/backstage/src/features/members/components/member-status-filter.tsx` — SegmentedControl + counts
- `apps/backstage/src/features/members/components/member-filter-meta.tsx` — chips + clear-all + count

**Modified:**
- `packages/ui/src/components/data-table.tsx` — add optional pagination
- `apps/backstage/src/features/members/repositories/member-repository.ts` — add `setStatus`
- `apps/backstage/src/features/members/hooks/use-update-member.ts` — optimistic
- `apps/backstage/src/features/members/hooks/use-delete-member.ts` — optimistic
- `apps/backstage/src/features/members/components/member-table.tsx` — Desde(year), pagination, ⋯ menu, no internal search/chips
- `apps/backstage/src/routes/_app.members.tsx` — orchestration

---

## Task 1: `member-filter` — search + status filter + counts

**Files:**
- Create: `apps/backstage/src/features/members/lib/member-filter.ts`
- Test: `apps/backstage/src/features/members/lib/member-filter.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import { filterMembers, statusCounts } from "./member-filter";

function member(p: Partial<Member>): Member {
  return {
    id: "1", name: "Ana Gómez", email: "ana@jci.bo", role: "Tesorera",
    joinDate: Timestamp.fromDate(new Date("2021-01-01T00:00:00Z")),
    birthdate: Timestamp.fromDate(new Date("1990-01-01T00:00:00Z")),
    status: "Activo", profilePicture: null, totalPoints: 0,
    active: true, deletedAt: null, ...p,
  };
}

describe("filterMembers", () => {
  const rows = [
    member({ id: "1", name: "Ana Gómez", email: "ana@jci.bo", role: "Tesorera", status: "Activo" }),
    member({ id: "2", name: "Beto Ruiz", email: "beto@jci.bo", role: "Presidente", status: "Inactivo" }),
    member({ id: "3", name: "Cy Paz", email: "cy@otra.bo", role: "Vocal", status: "Desafiliado" }),
  ];

  it("returns all with empty search and Todos", () => {
    expect(filterMembers(rows, { search: "", status: "Todos" })).toHaveLength(3);
  });
  it("matches name/email/role case-insensitively", () => {
    expect(filterMembers(rows, { search: "PRESI", status: "Todos" }).map((m) => m.id)).toEqual(["2"]);
    expect(filterMembers(rows, { search: "otra.bo", status: "Todos" }).map((m) => m.id)).toEqual(["3"]);
  });
  it("filters by status", () => {
    expect(filterMembers(rows, { search: "", status: "Activo" }).map((m) => m.id)).toEqual(["1"]);
  });
  it("ANDs search and status", () => {
    expect(filterMembers(rows, { search: "ruiz", status: "Activo" })).toHaveLength(0);
  });
});

describe("statusCounts", () => {
  it("counts each status plus total", () => {
    const rows = [
      member({ status: "Activo" }), member({ status: "Activo" }), member({ status: "Inactivo" }),
    ];
    expect(statusCounts(rows)).toEqual({ Todos: 3, Activo: 2, Inactivo: 1, Desafiliado: 0 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`pnpm --filter backstage test member-filter` → module not found)

- [ ] **Step 3: Implement**

```ts
import type { Member, MemberStatus } from "@luminova/types";
import { MEMBER_STATUSES } from "@luminova/types";

export type StatusFilter = "Todos" | MemberStatus;

export interface MemberFilter {
  search: string;
  status: StatusFilter;
}

export function filterMembers(members: Member[], { search, status }: MemberFilter): Member[] {
  const q = search.trim().toLowerCase();
  return members.filter((m) => {
    if (status !== "Todos" && m.status !== status) return false;
    if (!q) return true;
    return `${m.name} ${m.email} ${m.role}`.toLowerCase().includes(q);
  });
}

export type StatusCounts = Record<"Todos" | MemberStatus, number>;

export function statusCounts(members: Member[]): StatusCounts {
  const counts = { Todos: members.length } as StatusCounts;
  for (const s of MEMBER_STATUSES) counts[s] = 0;
  for (const m of members) counts[m.status] += 1;
  return counts;
}
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(backstage): member search/status filter logic"`

---

## Task 2: `member-display` — avatar color, join year, gender-aware copy

**Files:**
- Create: `apps/backstage/src/features/members/lib/member-display.ts`
- Test: `apps/backstage/src/features/members/lib/member-display.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { avatarColor, joinYear, actionMessage } from "./member-display";

describe("avatarColor", () => {
  it("is deterministic per id and returns a hex from the palette", () => {
    expect(avatarColor("abc")).toBe(avatarColor("abc"));
    expect(avatarColor("abc")).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe("joinYear", () => {
  it("returns the UTC year of joinDate", () => {
    expect(joinYear(Timestamp.fromDate(new Date("2021-07-09T00:00:00Z")))).toBe(2021);
  });
});

describe("actionMessage", () => {
  it("uses feminine form when first name ends in a", () => {
    expect(actionMessage("María José", "deactivated")).toBe("María José fue desactivada");
    expect(actionMessage("Ana Gómez", "deleted")).toBe("Ana Gómez fue eliminada");
    expect(actionMessage("Sofía Paz", "disaffiliated")).toBe("Sofía Paz fue desafiliada");
  });
  it("uses masculine form otherwise", () => {
    expect(actionMessage("Carlos Ruiz", "deactivated")).toBe("Carlos Ruiz fue desactivado");
    expect(actionMessage("Beto Paz", "reactivated")).toBe("Beto Paz fue reactivado");
  });
  it("renamed/saved/created/invited copy", () => {
    expect(actionMessage("Ana", "saved")).toBe("Se guardaron los cambios de Ana");
    expect(actionMessage("Ana", "created")).toBe("Ana fue agregada");
    expect(actionMessage("Beto", "created")).toBe("Beto fue agregado");
    expect(actionMessage("Ana", "invited")).toBe("Invitación enviada a Ana");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
import type { Timestamp } from "firebase/firestore";

const PALETTE = [
  "#1F4789", "#2563EB", "#0E7490", "#7C3AED", "#BE185D",
  "#B45309", "#15803D", "#9333EA", "#0F766E", "#C2410C",
];

export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function joinYear(joinDate: Timestamp): number {
  return joinDate.toDate().getUTCFullYear();
}

type GenderedAction = "deactivated" | "reactivated" | "disaffiliated" | "deleted" | "created";
type FlatAction = "saved" | "invited";
export type MemberAction = GenderedAction | FlatAction;

const GENDERED: Record<GenderedAction, [fem: string, masc: string]> = {
  deactivated: ["desactivada", "desactivado"],
  reactivated: ["reactivada", "reactivado"],
  disaffiliated: ["desafiliada", "desafiliado"],
  deleted: ["eliminada", "eliminado"],
  created: ["agregada", "agregado"],
};

function isFeminine(fullName: string): boolean {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase().endsWith("a");
}

export function actionMessage(name: string, action: MemberAction): string {
  if (action === "saved") return `Se guardaron los cambios de ${name}`;
  if (action === "invited") return `Invitación enviada a ${name}`;
  const [fem, masc] = GENDERED[action];
  return `${name} fue ${isFeminine(name) ? fem : masc}`;
}
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(backstage): member display + gender-aware action copy"`

---

## Task 3: `member-csv` — export current set

**Files:**
- Create: `apps/backstage/src/features/members/lib/member-csv.ts`
- Test: `apps/backstage/src/features/members/lib/member-csv.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import { membersToCsv } from "./member-csv";

const base: Member = {
  id: "1", name: "Ana Gómez", email: "ana@jci.bo", role: "Tesorera",
  joinDate: Timestamp.fromDate(new Date("2021-01-01T00:00:00Z")),
  birthdate: Timestamp.fromDate(new Date("1990-01-01T00:00:00Z")),
  status: "Activo", profilePicture: null, totalPoints: 12, active: true, deletedAt: null,
};

describe("membersToCsv", () => {
  it("emits a header and one row per member", () => {
    const csv = membersToCsv([base]);
    expect(csv.split("\n")[0]).toBe("Nombre,Correo,Rol,Estado,Desde,Puntos");
    expect(csv.split("\n")[1]).toBe("Ana Gómez,ana@jci.bo,Tesorera,Activo,2021,12");
  });
  it("quotes fields containing commas or quotes", () => {
    const csv = membersToCsv([{ ...base, role: 'Director, "Área"' }]);
    expect(csv.split("\n")[1]).toContain('"Director, ""Área"""');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
import type { Member } from "@luminova/types";
import { joinYear } from "./member-display";

const HEADER = ["Nombre", "Correo", "Rol", "Estado", "Desde", "Puntos"];

function cell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function membersToCsv(members: Member[]): string {
  const rows = members.map((m) =>
    [m.name, m.email, m.role, m.status, joinYear(m.joinDate), m.totalPoints].map(cell).join(","),
  );
  return [HEADER.join(","), ...rows].join("\n");
}
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(backstage): member CSV export helper"`

---

## Task 4: `role-suggestions`

**Files:**
- Create: `apps/backstage/src/features/members/lib/role-suggestions.ts`

- [ ] **Step 1: Implement (no test — static data)**

```ts
export const ROLE_SUGGESTIONS = [
  "Presidente", "Vicepresidente", "Secretario", "Tesorero",
  "Director de área", "Coordinador", "Vocal", "Miembro activo", "Aspirante",
] as const;
```

- [ ] **Step 2: Commit** — `git commit -m "feat(backstage): member role suggestions"`

---

## Task 5: `pageWindow` in @luminova/ui

**Files:**
- Create: `packages/ui/src/lib/page-window.ts`
- Test: `packages/ui/src/lib/page-window.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { pageWindow } from "./page-window";

describe("pageWindow", () => {
  it("lists every page when total <= 7", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it("truncates with an ellipsis at the start", () => {
    expect(pageWindow(8, 10)).toEqual([1, "…", 6, 7, 8, 9, 10]);
  });
  it("truncates with an ellipsis at the end", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, 5, "…", 10]);
  });
  it("truncates both sides in the middle", () => {
    expect(pageWindow(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`pnpm --filter @luminova/ui test page-window`)

- [ ] **Step 3: Implement**

```ts
export type PageToken = number | "…";

export function pageWindow(current: number, total: number): PageToken[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const tokens: PageToken[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) tokens.push("…");
  for (let p = start; p <= end; p += 1) tokens.push(p);
  if (end < total - 1) tokens.push("…");
  tokens.push(total);
  return tokens;
}
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(ui): page-window helper for pagination"`

---

## Task 6: Add optional pagination to `DataTable`

**Files:**
- Modify: `packages/ui/src/components/data-table.tsx`
- Test: `packages/ui/src/components/data-table.test.tsx` (extend if exists, else create)

Add two optional props. When `pageSize` is set, paginate the post-sort rows and render a pager (page-size `Select` + windowed strip via `pageWindow` + prev/next). Page resets to 1 when the filtered row count changes. Backward compatible: omit `pageSize` → no pager, current behavior.

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DataTable, type DataTableColumn } from "./data-table";

interface Row { id: string; n: number; }
const cols: DataTableColumn<Row>[] = [{ id: "n", header: "N", cell: (r) => r.n, sortValue: (r) => r.n }];
const rows: Row[] = Array.from({ length: 20 }, (_, i) => ({ id: String(i), n: i }));

describe("DataTable pagination", () => {
  it("shows only pageSize rows and a range summary", () => {
    render(<DataTable rows={rows} columns={cols} getRowId={(r) => r.id} pageSize={8} />);
    expect(screen.getAllByRole("row")).toHaveLength(1 + 8); // header + 8
    expect(screen.getByText(/Mostrando 1–8 de 20/)).toBeInTheDocument();
  });
  it("navigates to the next page", () => {
    render(<DataTable rows={rows} columns={cols} getRowId={(r) => r.id} pageSize={8} />);
    fireEvent.click(screen.getByLabelText("Página siguiente"));
    expect(screen.getByText(/Mostrando 9–16 de 20/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement** — add to `DataTableProps<T>`:

```ts
  pageSize?: number;
  pageSizeOptions?: number[];
```

In the component, after computing the sorted+filtered `visibleRows`, add:

```tsx
const [size, setSize] = useState(pageSize ?? 0);
const [page, setPage] = useState(1);
const total = visibleRows.length;
useEffect(() => { setPage(1); }, [total, size]);
const paged = size > 0 ? visibleRows.slice((page - 1) * size, page * size) : visibleRows;
const pageCount = size > 0 ? Math.max(1, Math.ceil(total / size)) : 1;
const from = total === 0 ? 0 : (page - 1) * size + 1;
const to = Math.min(page * size, total);
```

Render `paged` instead of `visibleRows` in the body. Below the `<Table>`, when `pageSize` is set, render:

```tsx
{pageSize && (
  <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink-3">
    <span>Mostrando {from}–{to} de {total} miembros</span>
    <div className="flex items-center gap-3">
      <Select value={String(size)} onChange={(e) => setSize(Number(e.target.value))} aria-label="Filas por página">
        {(pageSizeOptions ?? [8, 16, 32]).map((n) => <option key={n} value={n}>{n} por página</option>)}
      </Select>
      <div className="flex items-center gap-1">
        <IconButton as="button" size="sm" variant="subtle" aria-label="Página anterior"
          onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          {Icon.arrowLeft?.({ s: 16 }) ?? "‹"}
        </IconButton>
        {pageWindow(page, pageCount).map((tok, i) =>
          tok === "…" ? <span key={`e${i}`} className="px-1">…</span> : (
            <button key={tok} type="button" onClick={() => setPage(tok)}
              aria-current={tok === page ? "page" : undefined}
              className={cn("min-w-8 rounded-md px-2 py-1", tok === page ? "bg-jci-navy text-white" : "hover:bg-paper-2")}>
              {tok}
            </button>
          ))}
        <IconButton as="button" size="sm" variant="subtle" aria-label="Página siguiente"
          onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
          {Icon.arrowRight?.({ s: 16 }) ?? "›"}
        </IconButton>
      </div>
    </div>
  </div>
)}
```

Add imports: `useEffect`, `Select`, `IconButton`, `Icon`, `cn`, `pageWindow`. (Verify the exact arrow icon accessors against `components/icons`; fall back to `‹`/`›` glyphs if absent.)

- [ ] **Step 4: Run — expect PASS** (also run full `pnpm --filter @luminova/ui test` to confirm no regression for existing DataTable consumers)
- [ ] **Step 5: Commit** — `git commit -m "feat(ui): optional client pagination for DataTable"`

---

## Task 7: `setStatus` repository method

**Files:**
- Modify: `apps/backstage/src/features/members/repositories/member-repository.ts`
- Test: extend `apps/backstage/src/features/members/repositories/member-repository.test.ts` if present; otherwise rely on hook test in Task 8.

- [ ] **Step 1: Add method** (after `update`)

```ts
  /** Change membership standing only (Activo/Inactivo/Desafiliado). */
  async setStatus(id: string, status: Member["status"]): Promise<void> {
    await updateDoc(doc(this.collection, id), { status });
  }
```

Ensure `Member` is imported (it is). This only writes `status` → satisfies `firestore.rules` (`totalPoints`/`uid` unchanged, `softDeleteSafe`).

- [ ] **Step 2: Typecheck** — `pnpm --filter backstage typecheck` → PASS
- [ ] **Step 3: Commit** — `git commit -m "feat(backstage): member setStatus repository method"`

---

## Task 8: `use-set-member-status` + optimistic update/delete hooks

**Files:**
- Create: `apps/backstage/src/features/members/hooks/use-set-member-status.ts`
- Modify: `use-update-member.ts`, `use-delete-member.ts`

- [ ] **Step 1: Create `use-set-member-status.ts`** (optimistic)

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Member } from "@luminova/types";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

export function useSetMemberStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Member["status"] }) =>
      new MemberRepository().setStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: memberKeys.all });
      const previous = queryClient.getQueryData<Member[]>(memberKeys.all);
      queryClient.setQueryData<Member[]>(memberKeys.all, (rows) =>
        rows?.map((m) => (m.id === id ? { ...m, status } : m)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(memberKeys.all, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
```

- [ ] **Step 2: Make `use-delete-member.ts` optimistic** (remove row)

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Member } from "@luminova/types";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

export function useDeleteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new MemberRepository().softDelete(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: memberKeys.all });
      const previous = queryClient.getQueryData<Member[]>(memberKeys.all);
      queryClient.setQueryData<Member[]>(memberKeys.all, (rows) => rows?.filter((m) => m.id !== id));
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(memberKeys.all, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
```

- [ ] **Step 3: Make `use-update-member.ts` optimistic** — same onMutate/onError/onSettled pattern, mapping the matching row to `{ ...m, ...editable }` where editable mirrors the form fields (name/email/phone/role/profession/status; joinDate/birthdate left as-is since the form value is a string and the cache holds a Timestamp — only patch the string-safe scalar fields, keep existing Timestamps). Implementation:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Member, MemberInput } from "@luminova/types";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MemberInput }) =>
      new MemberRepository().update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: memberKeys.all });
      const previous = queryClient.getQueryData<Member[]>(memberKeys.all);
      queryClient.setQueryData<Member[]>(memberKeys.all, (rows) =>
        rows?.map((m) =>
          m.id === id
            ? { ...m, name: data.name, email: data.email, phone: data.phone ?? "",
                role: data.role, profession: data.profession ?? "", status: data.status }
            : m,
        ),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(memberKeys.all, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
```

- [ ] **Step 4: Typecheck** — `pnpm --filter backstage typecheck` → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(backstage): optimistic member mutations + setStatus hook"`

---

## Task 9: `member-row-menu` — Popover ⋯ menu

**Files:**
- Create: `apps/backstage/src/features/members/components/member-row-menu.tsx`
- Test: `apps/backstage/src/features/members/components/member-row-menu.test.tsx`

Context-sensitive menu built on `Popover` + `Can`. Callbacks for each action; the page wires them to hooks. Item visibility:
- Always: `Ver perfil`, `Editar miembro`
- `!member.uid` → `Invitar a la app`; `member.uid` → `Reenviar invitación` (both `<Can I="manage" a="all">`, the Admin gate)
- `status === "Activo"` → `Desactivar`; `status === "Inactivo"` → `Reactivar` (`<Can I="update" a="Member">`)
- `status !== "Desafiliado"` → `Desafiliar` (danger, `update`)
- `Eliminar miembro` (danger, `<Can I="delete" a="Member">`)

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import { MemberRowMenu } from "./member-row-menu";

vi.mock("../../../lib/authz/ability-context", () => ({ Can: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

function member(p: Partial<Member>): Member {
  return { id: "1", name: "Ana", email: "a@j.bo", role: "Vocal",
    joinDate: Timestamp.now(), birthdate: Timestamp.now(), status: "Activo",
    profilePicture: null, totalPoints: 0, active: true, deletedAt: null, ...p };
}
const noop = () => {};
const handlers = { onView: noop, onEdit: noop, onProvision: noop, onSetStatus: noop, onDelete: noop };

describe("MemberRowMenu", () => {
  it("shows Desactivar for an active member and Invitar when no uid", () => {
    render(<MemberRowMenu member={member({ status: "Activo" })} {...handlers} />);
    // open the menu
    screen.getByLabelText(/Acciones para Ana/).click();
    expect(screen.getByText("Desactivar")).toBeInTheDocument();
    expect(screen.getByText("Invitar a la app")).toBeInTheDocument();
    expect(screen.queryByText("Reactivar")).not.toBeInTheDocument();
  });
  it("shows Reactivar + Reenviar for an inactive member with uid", () => {
    render(<MemberRowMenu member={member({ status: "Inactivo", uid: "u1" })} {...handlers} />);
    screen.getByLabelText(/Acciones para Ana/).click();
    expect(screen.getByText("Reactivar")).toBeInTheDocument();
    expect(screen.getByText("Reenviar invitación")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement** (Popover trigger = IconButton with `Icon` ellipsis; verify the dots icon name in `components/icons`, fall back to `⋯`). Props:

```tsx
import type { Member, MemberStatus } from "@luminova/types";

interface MemberRowMenuProps {
  member: Member;
  onView: (m: Member) => void;
  onEdit: (m: Member) => void;
  onProvision: (m: Member) => void;
  onSetStatus: (m: Member, status: MemberStatus) => void;
  onDelete: (m: Member) => void;
}
```

Render a `Popover` whose content is a vertical list of menu buttons, each closing the popover then calling its handler. Danger items get red text. Gate each conditional item with `<Can>` as specified above.

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(backstage): member row context menu"`

---

## Task 10: `member-drawer` — Ver / Editar (Sheet)

**Files:**
- Create: `apps/backstage/src/features/members/components/member-drawer.tsx`
- Test: `apps/backstage/src/features/members/components/member-drawer.test.tsx`

Wraps `Sheet`. Prop `mode: "view" | "edit"`. View: avatar hero (initials + `avatarColor`) + status `Badge`, fields Correo/Rol/Miembro desde/Puntos, footer `Editar perfil` (→ `onEditMode`) and an `ArrowLink` to `/members/$memberId`. Edit: reuse the RHF form pattern from `member-form.tsx` but with a live-preview header (name + role echo) and a `role` `Input` plus `<datalist>` from `ROLE_SUGGESTIONS`; no área/profession/phone removed — keep existing fields (phone, profession, dates) since the schema requires joinDate/birthdate. Save gated by `memberSchema`.

> Note: `memberSchema` requires `joinDate`/`birthdate` (min) — keep those inputs in edit mode so saves validate. The drawer's "edit" body can import and render `MemberForm` directly with a preview header above it, rather than duplicating the form.

- [ ] **Step 1: Write failing test** (renders view fields; clicking "Editar perfil" calls `onEditMode`)

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import { MemberDrawer } from "./member-drawer";

const m: Member = { id: "1", name: "Ana Gómez", email: "ana@j.bo", role: "Tesorera",
  joinDate: Timestamp.fromDate(new Date("2021-01-01T00:00:00Z")), birthdate: Timestamp.now(),
  status: "Activo", profilePicture: null, totalPoints: 7, active: true, deletedAt: null };

describe("MemberDrawer view mode", () => {
  it("shows the member summary and switches to edit", () => {
    const onEditMode = vi.fn();
    render(<MemberDrawer open mode="view" member={m} onClose={() => {}} onEditMode={onEditMode} onSubmit={async () => {}} />);
    expect(screen.getByText("ana@j.bo")).toBeInTheDocument();
    expect(screen.getByText("2021")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Editar perfil"));
    expect(onEditMode).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement** props:

```tsx
interface MemberDrawerProps {
  open: boolean;
  mode: "view" | "edit";
  member: Member | null;
  onClose: () => void;
  onEditMode: () => void;
  onSubmit: (data: MemberInput) => Promise<void>;
}
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(backstage): member view/edit drawer"`

---

## Task 11: `member-invite-drawer` — 3-stage flow

**Files:**
- Create: `apps/backstage/src/features/members/components/member-invite-drawer.tsx`
- Test: `apps/backstage/src/features/members/components/member-invite-drawer.test.tsx`

Sheet with internal stage state `"form" | "creating" | "done"`. Form: Nombre*, Correo*, Rol (Input + datalist), Estado (Select default Activo), Checkbox "Enviar acceso a la app" (default checked). Submit disabled until name ≥ 3 and email valid (reuse `memberSchema.pick`). On submit: stage → `creating`; call `onCreate(data)` → returns the new `memberId`; if checkbox checked, call `onProvision(memberId)`; stage → `done`. Done: success copy via `actionMessage(name, "created")` + note about the access link if provisioned; buttons `Invitar a otra persona` (reset to form) / `Listo` (onClose).

Props:
```tsx
interface InviteData { name: string; email: string; role: string; status: MemberStatus; sendAccess: boolean; }
interface MemberInviteDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: MemberInput) => Promise<string>;     // returns new id
  onProvision: (memberId: string) => Promise<void>;
}
```

Build `MemberInput` from the invite fields, filling required schema fields: `phone: ""`, `profession: ""`, `joinDate` = today (`new Date().toISOString().slice(0,10)`), `birthdate` = same placeholder is invalid UX — instead make the invite form include a `Fecha de ingreso` date input (default today) and a `Fecha de nacimiento` date input (required by schema). Keep the invite form minimal but schema-complete.

- [ ] **Step 1: Write failing test** (submit advances to done, calls onCreate then onProvision when checked)
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(backstage): 3-stage member invite drawer"`

---

## Task 12: `member-status-filter` + `member-filter-meta`

**Files:**
- Create: `apps/backstage/src/features/members/components/member-status-filter.tsx`
- Create: `apps/backstage/src/features/members/components/member-filter-meta.tsx`

`member-status-filter`: `SegmentedControl` with options `Todos/Activo/Inactivo/Desafiliado`, each label showing its count from `statusCounts`. Props `{ value: StatusFilter; counts: StatusCounts; onChange: (v: StatusFilter) => void }`.

`member-filter-meta`: shows `Mostrando {shown} de {total}` and removable chips for active `search` and non-`Todos` `status`, plus a `Limpiar todo` button when any filter is active. Props `{ shown, total, search, status, onClearSearch, onClearStatus, onClearAll }`.

- [ ] **Step 1: Build both components** (verify `SegmentedOption` shape against `segmented-control.tsx`)
- [ ] **Step 2: Typecheck** → PASS
- [ ] **Step 3: Commit** — `git commit -m "feat(backstage): member status filter + filter meta row"`

---

## Task 13: Refactor `member-table.tsx`

**Files:**
- Modify: `apps/backstage/src/features/members/components/member-table.tsx`

Changes:
- Remove the internal `searchText`/`searchPlaceholder`/`chips`/`chipPredicate` props usage (filtering moves to the page). Accept already-filtered `members`.
- Change the `joinDate` column header to `Desde` and render `joinYear(member.joinDate)`; `sortValue` = `joinYear`.
- Keep Miembro (avatar uses `avatarColor(member.id)` background), Rol, Estado (badge, no dot except Activo per spec — pass `dot` only for `Activo`), Puntos.
- Replace the three inline `RowAction`s with `<MemberRowMenu .../>`.
- Enable pagination: pass `pageSize={pageSize}` and `pageSizeOptions={[8,16,32]}`.
- New props:

```tsx
interface MemberTableProps {
  members: Member[];
  pageSize: number;
  onView: (m: Member) => void;
  onEdit: (m: Member) => void;
  onProvision: (m: Member) => void;
  onSetStatus: (m: Member, status: MemberStatus) => void;
  onDelete: (m: Member) => void;
}
```

> Note: `pageSize` is owned by `DataTable`'s internal state once set; we pass the initial size. The page-size `Select` inside DataTable drives changes. (If we want the page to own page size, lift it later — not needed for v1.)

- [ ] **Step 1: Update component + existing `member-table.test.tsx`** to the new props (drop search/chip assertions; assert the ⋯ menu trigger renders and the Desde year shows).
- [ ] **Step 2: Run** `pnpm --filter backstage test member-table` → PASS
- [ ] **Step 3: Commit** — `git commit -m "feat(backstage): members table — Desde year, row menu, pagination"`

---

## Task 14: Orchestrate `_app.members.tsx`

**Files:**
- Modify: `apps/backstage/src/routes/_app.members.tsx`

Compose the console:
- State: `search`, `status` (`StatusFilter`), drawer `{ mode, member } | null`, invite open, `confirm` (for Desafiliar/Eliminar danger), `toast`.
- Derive: `counts = statusCounts(members)`, `filtered = filterMembers(members, { search, status })`.
- Header: eyebrow `\`${members.length} miembros\``; actions `Exportar` (calls `downloadCsv(membersToCsv(filtered))`) + `Invitar miembro` (`<Can I="create" a="Member">`, opens invite drawer).
- Filter bar: search `Input` + `MemberStatusFilter`.
- `MemberFilterMeta` with `shown={filtered.length}` `total={members.length}`.
- `MemberTable` (filtered, pageSize default 8) wired to: onView → open drawer view; onEdit → open drawer edit; onProvision → `provision.mutateAsync(m.id)` + toast `actionMessage(name,"invited")`; onSetStatus → for Desafiliar open confirm dialog, for Activo/Inactivo flips directly via `setStatus.mutateAsync` + gender toast; onDelete → open confirm dialog.
- `MemberDrawer` (view/edit) wired to `updateMember` + toast `actionMessage(name,"saved")`.
- `MemberInviteDrawer` wired: onCreate → `addMember.mutateAsync(data)` (returns id), onProvision → `provision.mutateAsync(id)`. On done, invalidate handled by hook.
- Confirm `Dialog` for Desafiliar (`setStatus` → "Desafiliado") and Eliminar (`deleteMember`) with gender toasts.
- Toast render with `~2800ms` auto-dismiss via `useEffect`.

Add a tiny `downloadCsv` helper inline or in `lib/member-csv.ts`:

```ts
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 1: Implement orchestration**
- [ ] **Step 2: Typecheck + lint** — `pnpm --filter backstage typecheck && pnpm --filter backstage lint` → PASS
- [ ] **Step 3: Commit** — `git commit -m "feat(backstage): wire members console page"`

---

## Task 15: Full verification

- [ ] **Step 1:** `pnpm --filter @luminova/ui test` → PASS (DataTable + page-window)
- [ ] **Step 2:** `pnpm --filter backstage run ci` → prettier, eslint, tsc, vite build, vitest, knip, size-limit all PASS
- [ ] **Step 3:** Dispatch `bundle-budget-watcher` subagent (DataTable + new routes/components added) — address any budget breach or dead export.
- [ ] **Step 4:** `/security-review` on the diff (auth-gated mutations + provisioning + repository touch).
- [ ] **Step 5:** Dispatch `firestore-security-reviewer` (repository `setStatus` added).
- [ ] **Step 6:** Final commit if review fixes applied.

---

## Self-Review notes (coverage vs spec)

- 4 header / 5 search+status / 6 sort+Puntos+Desde / 7 pagination / 8 ⋯ menu (uid-keyed invite, status flips, Desafiliar≠Eliminar, soft-delete, Can-gates) / 9 drawer 2 modes / 10 invite 3-stage creating real row + default-on provision / 11 states (skeleton via DataTable isLoading, empty states, toasts, error rollback) / 12 permissions (Can gates + Admin provisioning) — all mapped to Tasks 1–14.
- Deferred per spec (email, área, dues statuses, server pagination) — intentionally absent.
- `MemberRowMenu` handler names (`onView/onEdit/onProvision/onSetStatus/onDelete`) are consistent across Tasks 9, 13, 14.
