# B1 — Member home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A member logs in (via an Admin-invite callable) and sees their own points + byMonth, personal QR, participation ledger, and points-rank at `/me`, reusing A5/A6/A3 pieces.

**Architecture:** New beacon `provisionMemberLogin` callable (Admin-guarded, admin-SDK) creates/links the member's Auth user + `Member` claim + writes `member.uid`. Backstage gets a `/me` role-aware home, a current-member lookup by uid, a pure points-rank, and an Admin invite action. `firestore.rules` untouched (member reads already permitted; uid written by admin SDK).

**Tech stack:** React 19, TanStack Router/Query, Firebase web SDK (+ a new `functions` instance in `@luminova/firebase`), firebase-admin (beacon), vitest + RTL.

**Branch:** `feat/member-home` (created).

**Gotcha (new route):** after adding `_app.me.tsx`, run `pnpm --filter backstage exec vite build` once to regenerate `routeTree.gen.ts`, then full build/ci.

---

## Task 1: Add `functions` to `@luminova/firebase`

**Files:** Modify `packages/firebase/src/index.ts`

- [ ] **Step 1: Add the Functions instance** (functions emulator is port 4020 per CLAUDE.md).
Add import:
```ts
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
```
Add port const `const FUNCTIONS_PORT = 4020;`, extend the type:
```ts
export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
};
```
After `const storage = getStorage(app);` add `const functions = getFunctions(app);`. In the emulator block add `connectFunctionsEmulator(functions, EMULATOR_HOST, FUNCTIONS_PORT);`. Set `services = { app, auth, db, storage, functions };`.

- [ ] **Step 2: Verify** `pnpm --filter @luminova/firebase run ci` — expect PASS. (`firebase` already a dep; no secure-dep-vetting.)

- [ ] **Step 3: Commit** `git add packages/firebase && git commit -m "feat(firebase): expose Functions instance (+ emulator wiring)"`

---

## Task 2: beacon `provisionMemberLogin` callable

**Files:**
- Create: `apps/beacon/src/provision-member-login.ts`
- Create: `apps/beacon/src/provision-member-login.test.ts`
- Modify: `apps/beacon/src/index.ts` (export)

- [ ] **Step 1: Write the failing pure-helper tests**

`provision-member-login.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateProvisionInput, nextClaims } from "./provision-member-login";

describe("validateProvisionInput", () => {
  it("accepts a clean memberId", () => {
    expect(validateProvisionInput({ memberId: "m-1" })).toEqual({ memberId: "m-1" });
  });
  it("rejects missing / empty / unclean memberId", () => {
    expect(() => validateProvisionInput({})).toThrow();
    expect(() => validateProvisionInput({ memberId: "" })).toThrow();
    expect(() => validateProvisionInput({ memberId: "a/b" })).toThrow();
  });
});

describe("nextClaims", () => {
  it("adds Member to empty claims", () => {
    expect(nextClaims(undefined, "Member")).toEqual({ roles: ["Member"] });
  });
  it("merges Member without clobbering existing roles / scannerEventIds", () => {
    expect(nextClaims({ roles: ["ProjectManager"], scannerEventIds: ["e1"] }, "Member")).toEqual({
      roles: ["ProjectManager", "Member"],
      scannerEventIds: ["e1"],
    });
  });
  it("is idempotent when the role is already present", () => {
    expect(nextClaims({ roles: ["Member"] }, "Member")).toEqual({ roles: ["Member"] });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `pnpm --filter beacon exec vitest run src/provision-member-login.test.ts`

- [ ] **Step 3: Implement**

`provision-member-login.ts`:
```ts
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import type { Role } from "@luminova/auth/roles";

export interface ProvisionInput {
  memberId: string;
}

interface RawClaims {
  roles?: unknown;
  scannerEventIds?: unknown;
}

export function validateProvisionInput(data: unknown): ProvisionInput {
  const raw = (data ?? {}) as { memberId?: unknown };
  if (typeof raw.memberId !== "string" || raw.memberId.length === 0 || raw.memberId.includes("/")) {
    throw new HttpsError("invalid-argument", "memberId is required");
  }
  return { memberId: raw.memberId };
}

/** Merge a role into existing custom claims without clobbering other roles or
 *  scannerEventIds. */
export function nextClaims(
  existing: RawClaims | undefined,
  role: Role,
): { roles: Role[]; scannerEventIds?: string[] } {
  const current = Array.isArray(existing?.roles)
    ? (existing.roles as unknown[]).filter((r): r is Role => typeof r === "string")
    : [];
  const roles = current.includes(role) ? current : [...current, role];
  const scannerEventIds = Array.isArray(existing?.scannerEventIds)
    ? (existing.scannerEventIds as unknown[]).filter((s): s is string => typeof s === "string")
    : undefined;
  return scannerEventIds ? { roles, scannerEventIds } : { roles };
}

function app() {
  if (!getApps().length) initializeApp();
}

function callerRoles(request: CallableRequest): string[] {
  const token = request.auth?.token as { roles?: unknown } | undefined;
  return Array.isArray(token?.roles)
    ? (token.roles as unknown[]).filter((r): r is string => typeof r === "string")
    : [];
}

export const provisionMemberLogin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "sign-in required");
  if (!callerRoles(request).includes("Admin")) {
    throw new HttpsError("permission-denied", "Admin role required");
  }
  const { memberId } = validateProvisionInput(request.data);
  app();
  const db = getFirestore();
  const auth = getAuth();

  const snap = await db.doc(`members/${memberId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "member not found");
  const member = snap.data() as { email?: string; active?: boolean };
  if (member.active === false) throw new HttpsError("failed-precondition", "member is inactive");
  const email = member.email;
  if (!email) throw new HttpsError("failed-precondition", "member has no email");

  const user = await auth.getUserByEmail(email).catch(() => null);
  const uid = user ? user.uid : (await auth.createUser({ email })).uid;
  const existing = (user?.customClaims ?? undefined) as RawClaims | undefined;
  await auth.setCustomUserClaims(uid, nextClaims(existing, "Member"));
  await db.doc(`members/${memberId}`).update({ uid });
  const actionLink = await auth.generatePasswordResetLink(email);

  return { email, actionLink } as const;
});
```

- [ ] **Step 4: Export** — in `apps/beacon/src/index.ts` add:
```ts
export { provisionMemberLogin } from "./provision-member-login.js";
```

- [ ] **Step 5: Run + ci.** `pnpm --filter beacon exec vitest run src/provision-member-login.test.ts` (PASS), then `pnpm --filter beacon run ci`.

- [ ] **Step 6: Commit** `git add apps/beacon && git commit -m "feat(beacon): provisionMemberLogin callable (Admin invite → Member login)"`

---

## Task 3: `pointsRank` pure helper (backstage)

**Files:** Create `apps/backstage/src/lib/points-rank.ts` + `.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { pointsRank } from "./points-rank";
import type { MemberPoints } from "@luminova/types/engine";

const pts = (id: string, cumulative: number) =>
  ({ id: `${id}__2026`, memberId: id, termId: "2026", cumulative, byMonth: {} }) as MemberPoints;

describe("pointsRank", () => {
  it("ranks by cumulative (1-based), counting only positive entries", () => {
    const all = [pts("a", 10), pts("b", 4), pts("c", 7), pts("d", 0)];
    expect(pointsRank(all, "a")).toEqual({ rank: 1, total: 3 });
    expect(pointsRank(all, "c")).toEqual({ rank: 2, total: 3 });
    expect(pointsRank(all, "b")).toEqual({ rank: 3, total: 3 });
  });
  it("returns null when the member has no positive entry", () => {
    expect(pointsRank([pts("a", 10)], "z")).toBeNull();
    expect(pointsRank([pts("a", 0)], "a")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**
```ts
import type { MemberPoints } from "@luminova/types/engine";

/** The member's 1-based rank by cumulative points among members with > 0 points.
 *  Null if the member has no positive entry. No eligibility exclusions (v1). */
export function pointsRank(
  all: MemberPoints[],
  memberId: string,
): { rank: number; total: number } | null {
  const scored = all.filter((p) => p.cumulative > 0);
  const mine = scored.find((p) => p.memberId === memberId);
  if (!mine) return null;
  const rank = scored.filter((p) => p.cumulative > mine.cumulative).length + 1;
  return { rank, total: scored.length };
}
```

- [ ] **Step 4: Run — expect PASS. Step 5: Commit** with Task 4.

---

## Task 4: `isMemberOnly` pure helper

**Files:** Create `apps/backstage/src/lib/authz/is-member-only.ts` + `.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { isMemberOnly } from "./is-member-only";

describe("isMemberOnly", () => {
  it("true for a plain Member", () => {
    expect(isMemberOnly({ roles: ["Member"] })).toBe(true);
  });
  it("false when any privileged role is present", () => {
    expect(isMemberOnly({ roles: ["Member", "ProjectManager"] })).toBe(false);
    expect(isMemberOnly({ roles: ["Admin"] })).toBe(false);
  });
  it("false when there are no roles at all", () => {
    expect(isMemberOnly({ roles: [] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**
```ts
import type { AuthClaims } from "@luminova/auth/roles";

const PRIVILEGED = ["Admin", "Membership", "Treasury", "ExecutiveCommittee", "ProjectManager"];

/** A member-only user: has the Member role and none of the privileged roles. Used
 *  to route them to /me instead of the admin Overview. */
export function isMemberOnly(claims: AuthClaims): boolean {
  return claims.roles.includes("Member") && !claims.roles.some((r) => PRIVILEGED.includes(r));
}
```

- [ ] **Step 4: Run — expect PASS. Step 5: Commit** `git add apps/backstage/src/lib && git commit -m "feat(backstage): pointsRank + isMemberOnly helpers"`

---

## Task 5: `MemberRepository.getByUid` + `useCurrentMember`

**Files:**
- Modify: `apps/backstage/src/features/members/repositories/member-repository.ts`
- Modify: `apps/backstage/src/features/members/hooks/member-keys.ts`
- Create: `apps/backstage/src/features/members/hooks/use-current-member.ts`

- [ ] **Step 1: Add `getByUid`** to `MemberRepository` (imports `query, where, limit, getDocs` already partly present — add `limit`):
```ts
async getByUid(uid: string): Promise<Member | null> {
  const snapshot = await getDocs(
    query(this.collection, where("uid", "==", uid), where("active", "==", true), limit(1)),
  );
  const d = snapshot.docs[0];
  return d ? { id: d.id, ...(d.data() as Omit<Member, "id">) } : null;
}
```
(Add `limit` to the `firebase/firestore` import.)

- [ ] **Step 2: Keys + hook.** Add to `member-keys.ts`:
```ts
  byUid: (uid: string) => ["members", "uid", uid] as const,
```
`use-current-member.ts`:
```ts
import { useQuery } from "@tanstack/react-query";
import { MemberRepository } from "../repositories/member-repository";
import { useAuth } from "../../../lib/auth/auth";
import { memberKeys } from "./member-keys";

export function useCurrentMember() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  return useQuery({
    queryKey: memberKeys.byUid(uid ?? "none"),
    queryFn: () => new MemberRepository().getByUid(uid as string),
    enabled: !!uid,
  });
}
```

- [ ] **Step 3: Typecheck** `pnpm --filter backstage exec tsc --noEmit` — PASS.

- [ ] **Step 4: Commit** `git add apps/backstage/src/features/members && git commit -m "feat(backstage): member lookup by uid + useCurrentMember"`

---

## Task 6: Extract `MemberPointsSummary` from A5

**Files:**
- Create: `apps/backstage/src/features/members/components/member-points-summary.tsx`
- Modify: `apps/backstage/src/routes/_app.members_.$memberId.tsx` (consume it)

- [ ] **Step 1: Implement the component** — lift the points/byMonth/Sparkline block from the profile route verbatim:
```tsx
import { Sparkline } from "@luminova/ui";
import type { MemberPoints } from "@luminova/types/engine";

interface MemberPointsSummaryProps {
  points: MemberPoints | null | undefined;
  termId: string;
}

export function MemberPointsSummary({ points, termId }: MemberPointsSummaryProps) {
  const months = Object.entries(points?.byMonth ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  return (
    <div className="flex flex-wrap items-end gap-8 rounded-[14px] border border-line bg-surface px-6 py-5">
      <div>
        <div className="text-[34px] leading-none font-semibold text-ink-1 tabular-nums">
          {points?.cumulative ?? 0}
        </div>
        <div className="mt-1.5 text-[12px] text-ink-3">puntos confirmados · {termId}</div>
      </div>
      {months.length >= 2 && <Sparkline values={months.map(([, value]) => value)} />}
      {months.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-3">
          {months.map(([month, value]) => (
            <li key={month} className="tabular-nums">
              <span className="text-ink-2">{month}</span> · {value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Refactor the profile route** — in `_app.members_.$memberId.tsx`, replace the inline points `<div>…</div>` block + the `const months = …` line with `<MemberPointsSummary points={points} termId={termId} />` and import it. Drop the now-unused `Sparkline` import if nothing else uses it.

- [ ] **Step 3: Run profile tests** `pnpm --filter backstage exec vitest run src/features/members` + `tsc --noEmit` — PASS.

- [ ] **Step 4: Commit** `git add apps/backstage && git commit -m "refactor(backstage): extract MemberPointsSummary (shared by profile + /me)"`

---

## Task 7: `/me` member home route

**Files:**
- Create: `apps/backstage/src/routes/_app.me.tsx`
- Create: `apps/backstage/src/routes/_app.me.test.tsx`

- [ ] **Step 1: Failing render test** (mock the hooks). Assert: with a member + points, shows the QR label + rank line; with null member shows the unlinked message.
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../features/members/hooks/use-current-member", () => ({
  useCurrentMember: () => ({ data: { id: "m1", name: "Ana", status: "Activo" }, isLoading: false }),
}));
vi.mock("../features/members/hooks/use-member-points", () => ({
  useMemberPoints: () => ({ data: { memberId: "m1", termId: "2026", cumulative: 7, byMonth: { "2026-06": 7 } } }),
}));
vi.mock("../features/members/hooks/use-member-participations", () => ({
  useMemberParticipations: () => ({ data: [] }),
}));
vi.mock("../features/members/hooks/use-member-points-by-term", () => ({
  useMemberPointsByTerm: () => ({ data: [{ memberId: "m1", termId: "2026", cumulative: 7, byMonth: {} }] }),
}));
import { MemberHome } from "./_app.me";

describe("MemberHome", () => {
  it("renders points, QR and rank for the current member", () => {
    render(<MemberHome />);
    expect(screen.getByText(/tu qr personal/i)).toBeInTheDocument();
    expect(screen.getByText(/puesto por puntos/i)).toBeInTheDocument();
  });
});
```
(Export the component as a named `MemberHome` for testability, alongside the route.)

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `_app.me.tsx`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { QrCode } from "@luminova/ui/qr-code";
import { PageHeader } from "../components/page-header";
import { currentTermId } from "../lib/current-term";
import { encodeMemberQr } from "../lib/member-qr";
import { pointsRank } from "../lib/points-rank";
import { useCurrentMember } from "../features/members/hooks/use-current-member";
import { useMemberPoints } from "../features/members/hooks/use-member-points";
import { useMemberParticipations } from "../features/members/hooks/use-member-participations";
import { useMemberPointsByTerm } from "../features/members/hooks/use-member-points-by-term";
import { MemberPointsSummary } from "../features/members/components/member-points-summary";
import { ParticipationLedger } from "../features/members/components/participation-ledger";

export const Route = createFileRoute("/_app/me")({ component: MemberHome });

export function MemberHome() {
  const termId = currentTermId();
  const { data: member, isLoading } = useCurrentMember();
  const memberId = member?.id ?? "";
  const { data: points } = useMemberPoints(memberId, termId);
  const { data: participations } = useMemberParticipations(memberId, termId);
  const { data: allPoints } = useMemberPointsByTerm(termId);

  if (isLoading) return <p className="text-ink-3">Cargando…</p>;
  if (!member) {
    return (
      <p className="text-ink-2">Tu usuario no está vinculado a un perfil de miembro.</p>
    );
  }

  const rank = allPoints ? pointsRank(allPoints, member.id) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Mi panel" title={member.name} />
      <MemberPointsSummary points={points} termId={termId} />
      {rank && (
        <p className="text-[13px] text-ink-2">
          Puesto por puntos · <span className="font-semibold text-ink-1">{rank.rank}</span> de{" "}
          {rank.total}
        </p>
      )}
      <div className="flex w-fit flex-col items-center gap-3 rounded-[14px] border border-line bg-surface px-6 py-5">
        <QrCode value={encodeMemberQr(member.id)} size={176} />
        <p className="text-[12px] text-ink-3">Tu QR personal · muéstralo en el check-in</p>
      </div>
      <ParticipationLedger rows={participations ?? []} />
    </div>
  );
}
```

- [ ] **Step 4: Regenerate tree + run.** `pnpm --filter backstage exec vite build` then `pnpm --filter backstage exec vitest run src/routes/_app.me.test.tsx` — PASS.

- [ ] **Step 5: Commit** `git add apps/backstage && git commit -m "feat(backstage): /me member home (points + QR + ledger + rank)"`

---

## Task 8: Provisioning UI — invite action on the profile

**Files:**
- Create: `apps/backstage/src/features/members/hooks/use-provision-member-login.ts`
- Modify: `apps/backstage/src/routes/_app.members_.$memberId.tsx`

- [ ] **Step 1: Mutation hook**
```ts
import { useMutation } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "@luminova/firebase";

interface ProvisionResult {
  email: string;
  actionLink: string;
}

export function useProvisionMemberLogin() {
  return useMutation({
    mutationFn: async (memberId: string) => {
      const fn = httpsCallable<{ memberId: string }, ProvisionResult>(
        getFirebase().functions,
        "provisionMemberLogin",
      );
      return (await fn({ memberId })).data;
    },
  });
}
```

- [ ] **Step 2: Profile action** — in `_app.members_.$memberId.tsx`, add an Admin-gated header action `<Can I="manage" a="all">` (Admin-only) showing a `Button` labeled `member.uid ? "Reenviar acceso" : "Invitar acceso"`. On click → `provision.mutate(member.id)`; on success open a `Dialog` showing `result.actionLink` with a copy button + helper text ("Comparte este enlace con el miembro para que cree su contraseña."). Wire `useProvisionMemberLogin` + local `useState` for the dialog/result. Use the existing `Dialog`, `Button` from `@luminova/ui`.

- [ ] **Step 3: Run** `pnpm --filter backstage exec vitest run src/features/members src/routes` + `tsc --noEmit` — PASS. (knip: `functions` now consumed.)

- [ ] **Step 4: Commit** `git add apps/backstage && git commit -m "feat(backstage): Admin 'Invitar acceso' action on member profile"`

---

## Task 9: Nav — "Mi panel" + roles gate on leaderboard

**Files:**
- Modify: `apps/backstage/src/components/nav-config.ts`
- Modify: `apps/backstage/src/components/app-sidebar.tsx`
- Modify: `apps/backstage/src/components/nav-config.test.ts`

- [ ] **Step 1: Extend `NavItem`** — add `roles?: Role[]` (import `type { Role } from "@luminova/auth/roles"`). Widen `to` with `"/me"`. Add to the "Panel" group:
```ts
{ to: "/me", label: "Mi panel", icon: "user" },
```
Gate the leaderboard item:
```ts
{ to: "/leaderboard", label: "Clasificación", icon: "barChart",
  roles: ["Admin", "Membership", "Treasury", "ExecutiveCommittee", "ProjectManager"] },
```

- [ ] **Step 2: Sidebar honors `roles`** — in `app-sidebar.tsx`, import `hasAnyRole` from `@luminova/auth/roles` and the claims from `useAuth`; extend the filter:
```ts
items: group.items.filter(
  (item) =>
    (!item.subject || ability.can(item.action ?? "read", item.subject)) &&
    (!item.roles || hasAnyRole(claims, item.roles)),
),
```
(Get `claims` from `useAuth()` — it already exposes `claims`; confirm and destructure.)

- [ ] **Step 3: Update `nav-config.test.ts`** — add `/me` to the expected paths list (in order), assert leaderboard has the `roles` allowlist excluding `Member`, and that `/me` exists labeled "Mi panel".

- [ ] **Step 4: Run** `pnpm --filter backstage exec vitest run src/components` — PASS.

- [ ] **Step 5: Commit** `git add apps/backstage && git commit -m "feat(backstage): Mi panel nav + hide leaderboard from plain Members"`

---

## Task 10: Redirect member-only off the admin Overview

**Files:** Modify `apps/backstage/src/routes/_app.index.tsx`

- [ ] **Step 1: Add `beforeLoad`** to the index route (reads the auth context like `_app.tsx`):
```ts
import { createFileRoute, redirect } from "@tanstack/react-router";
import { isMemberOnly } from "../lib/authz/is-member-only";
// ...
export const Route = createFileRoute("/_app/")({
  beforeLoad: async ({ context }) => {
    await context.auth.ready;
    if (isMemberOnly(context.auth.getState().claims)) throw redirect({ to: "/me" });
  },
  component: DashboardPage,
});
```
(Confirm the router context type exposes `auth` — `_app.tsx` already uses `context.auth`.)

- [ ] **Step 2: Verify** `pnpm --filter backstage exec vite build` (regen tree if needed) + `pnpm --filter backstage run ci` — PASS.

- [ ] **Step 3: Commit** `git add apps/backstage && git commit -m "feat(backstage): route member-only users from / to /me"`

---

## Task 11: Verification + reviews + e2e

- [ ] **Step 1: Full gate** — `pnpm format`, `pnpm exec turbo run ci --filter='!@luminova/firestore-rules-tests'`, `pnpm knip`, `pnpm audit --audit-level=high`. (rules untouched, but run the rules suite directly if an emulator is up: `pnpm --filter @luminova/firestore-rules-tests run test:run` to confirm no regression.)

- [ ] **Step 2: Reviews** — `firebase-functions-reviewer` (the new callable: Admin-guard, input validation, idempotency, claim-merge safety, no self-provision escalation) + `/security-review` on the diff (privilege boundary: provisioning + uid write). `firestore-security-reviewer` only if rules changed (they shouldn't).

- [ ] **Step 3: Emulator e2e** (functions + firestore + auth up; rebuild beacon so the emulator loads the callable: `pnpm --filter beacon build`):
  - Seed a member with an email (reuse `seed:emulator` or the e2e member).
  - Call `provisionMemberLogin({ memberId })` (admin context) → assert: Auth user exists for the email, has `roles:['Member']` claim, `members/{id}.uid` set, `actionLink` returned. Re-call → idempotent (same uid).
  - In backstage dev: sign in as the provisioned member → `/` redirects to `/me`; `/me` shows points/QR/ledger/rank; "Clasificación" nav hidden.
  - Extend `tools/scripts/` with a `e2e-provision-member.mjs` if helpful.

- [ ] **Step 4: Status doc** `docs/status/2026-06-06-member-home.md` (shipped + deferred), then `gh pr create` to main with the standard template; run `pnpm pr-tests` after.

---

## Self-review notes

- **Spec coverage:** provisioning callable (T2) + firebase functions instance (T1); current-member lookup (T5); rank (T3) + home (T7); summary extraction (T6); invite UI (T8); nav + redirect (T9, T10); helpers (T3/T4). All spec sections mapped.
- **Type consistency:** `nextClaims`/`validateProvisionInput` (T2) used only in beacon; `pointsRank`/`isMemberOnly` (T3/T4) used in T7/T10; `getByUid`/`useCurrentMember` (T5) used in T7; `MemberPointsSummary` (T6) used in T7 + profile; `useProvisionMemberLogin` (T8) used in profile. `MemberPoints` reused (engine type).
- **Open risk:** confirm `useAuth()` exposes `claims` (used in T9) and the router context type carries `auth` (T10) — both already used elsewhere (`auth-store` decodes claims; `_app.tsx` reads `context.auth`). If the index `beforeLoad` can't see context typing, mirror `_app.tsx`'s signature exactly.
