# Backstage Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap `apps/backstage` from an empty package to a running admin shell with email/password auth, a public `/login`, and an auth-guarded app area.

**Architecture:** Branch 1 mirrors `apps/spotlight`'s Vite + TanStack Router + Tailwind v4 setup and adds a `QueryClientProvider`. Branch 2 adds a single `onAuthStateChanged` auth store fed into TanStack Router context; route guards `await context.auth.ready` then redirect unauthenticated users to `/login`, preserving the intended href.

**Tech Stack:** React 19, TypeScript 6 (strict), Vite 8, TanStack Router + Query v5, React Hook Form + Zod, Firebase Auth (via `@luminova/firebase`), Tailwind v4, `@luminova/ui`, Vitest + Testing Library.

---

## File Structure

**Branch 1 — `chore/backstage-bootstrap`**
- `apps/backstage/package.json` — deps + scripts (mirror spotlight)
- `apps/backstage/vite.config.ts` — tanstackRouter + react + tailwindcss plugins
- `apps/backstage/vitest.config.ts` — jsdom env, setup file
- `apps/backstage/tsconfig.json` — extends base, jsx, vite types
- `apps/backstage/index.html` — `lang="es"`, `#root`
- `apps/backstage/src/vite-env.d.ts` — vite client types
- `apps/backstage/src/test/setup.ts` — jest-dom matchers
- `apps/backstage/src/styles.css` — tailwind + `@luminova/ui/theme.css` + `@source`
- `apps/backstage/src/lib/query-client.ts` — `QueryClient` singleton
- `apps/backstage/src/lib/router-context.ts` — `RouterContext` interface
- `apps/backstage/src/router.tsx` — `createRouter` + typed `Register`
- `apps/backstage/src/main.tsx` — `createRoot` → `RouterProvider`
- `apps/backstage/src/routes/__root.tsx` — `QueryClientProvider` + `Outlet`
- `apps/backstage/src/routes/index.tsx` — temporary placeholder (removed in branch 2)
- `apps/backstage/src/routeTree.gen.ts` — generated, committed
- Delete: `apps/backstage/src/index.ts`, `apps/backstage/src/index.test.ts`

**Branch 2 — `feat/backstage-auth`**
- `apps/backstage/src/lib/auth/auth-store.ts` — `createAuthStore(auth)` factory
- `apps/backstage/src/lib/auth/auth.ts` — singleton store + `useAuth` hook
- `apps/backstage/src/lib/auth/sign-in.ts` — `signInWithEmailAndPassword` wrapper
- `apps/backstage/src/lib/auth/sign-out.ts` — `signOut` wrapper
- `apps/backstage/src/lib/auth/auth-errors.ts` — Firebase code → Spanish message
- `apps/backstage/src/lib/auth/guard.ts` — pure `authRedirect()` helper
- `apps/backstage/src/lib/auth/*.test.ts` — unit tests
- `apps/backstage/src/components/pending-screen.tsx` — branded pending component
- `apps/backstage/src/components/app-sidebar.tsx` — minimal sidebar
- `apps/backstage/src/features/auth/types/login-schema.ts` — Zod schema
- `apps/backstage/src/features/auth/components/login-form.tsx` — RHF form
- `apps/backstage/src/features/auth/components/login-form.test.tsx` — form test
- `apps/backstage/src/routes/_auth.tsx` — centered-card layout
- `apps/backstage/src/routes/_auth.login.tsx` — `/login`
- `apps/backstage/src/routes/_app.tsx` — protected layout + guard
- `apps/backstage/src/routes/_app.index.tsx` — `/` dashboard
- Modify: `src/lib/router-context.ts` (add `auth`), `src/router.tsx` (context + pending), `src/main.tsx` (start + invalidate)
- Delete: `apps/backstage/src/routes/index.tsx`

---

# BRANCH 1 — `chore/backstage-bootstrap`

> Already on branch `chore/backstage-bootstrap`. The design spec was committed here.

### Task 1: Add bootstrap dependencies

**Files:** Modify `apps/backstage/package.json`

- [ ] **Step 1: Add deps mirroring spotlight + the new ones**

Versions for deps already in the repo are taken from `apps/spotlight/package.json` / root (not memory). The genuinely new deps (`@tanstack/react-query`, `jsdom`, Testing Library) are resolved via the `secure-dep-vetting` skill. Run from repo root:

```bash
pnpm --filter backstage add react@^19.2.7 react-dom@^19.2.7 \
  @tanstack/react-router@^1.170.11 "@luminova/ui@workspace:*"
# new — resolve latest secure via secure-dep-vetting before running:
pnpm --filter backstage add @tanstack/react-query
pnpm --filter backstage add -D vite@^8.0.16 @vitejs/plugin-react@^6.0.2 \
  @tailwindcss/vite@^4.3.0 tailwindcss@^4.3.0 @tanstack/router-plugin@^1.168.14 \
  @types/react@^19.2.16 @types/react-dom@^19.2.3
# new — resolve latest secure via secure-dep-vetting before running:
pnpm --filter backstage add -D jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Set package.json scripts (mirror spotlight)**

Replace the `scripts` block in `apps/backstage/package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "build": "tsc --noEmit && vite build",
    "ci": "eslint . && tsc --noEmit && vitest run --passWithNoTests"
  }
}
```

- [ ] **Step 3: Install + verify resolution**

Run: `pnpm install`
Expected: completes without peer-dependency errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backstage/package.json pnpm-lock.yaml
git commit -m "chore(backstage): add bootstrap dependencies"
```

### Task 2: Config files + entry HTML + styles

**Files:** Create `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html`, `src/vite-env.d.ts`, `src/test/setup.ts`, `src/styles.css`

- [ ] **Step 1: `apps/backstage/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
});
```

- [ ] **Step 2: `apps/backstage/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

- [ ] **Step 3: `apps/backstage/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "noEmit": true
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: `apps/backstage/index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JCI Oriente — Backstage</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: `apps/backstage/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 6: `apps/backstage/src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 7: `apps/backstage/src/styles.css`**

```css
@import "tailwindcss";
@import "@luminova/ui/theme.css";
/* Scan @luminova/ui source so its Tailwind utility classes aren't purged. */
@source "../../../packages/ui/src/**/*.{ts,tsx}";

@layer base {
  * {
    box-sizing: border-box;
  }
  html,
  body {
    margin: 0;
    padding: 0;
  }
  body {
    font-family: var(--font-sans, system-ui, sans-serif);
    color: var(--color-ink-1, #130f2d);
    background: var(--color-surface, #f7f9fb);
    -webkit-font-smoothing: antialiased;
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition-duration: 0.001ms !important;
      animation-duration: 0.001ms !important;
    }
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/backstage/vite.config.ts apps/backstage/vitest.config.ts \
  apps/backstage/tsconfig.json apps/backstage/index.html \
  apps/backstage/src/vite-env.d.ts apps/backstage/src/test/setup.ts \
  apps/backstage/src/styles.css
git commit -m "chore(backstage): vite, vitest, tailwind, tsconfig scaffold"
```

### Task 3: Query client, router, root route, entry, placeholder route

**Files:** Create `src/lib/query-client.ts`, `src/lib/router-context.ts`, `src/router.tsx`, `src/main.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`. Delete `src/index.ts`, `src/index.test.ts`.

- [ ] **Step 1: `apps/backstage/src/lib/query-client.ts`**

```ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();
```

- [ ] **Step 2: `apps/backstage/src/lib/router-context.ts`**

```ts
import type { QueryClient } from "@tanstack/react-query";

export interface RouterContext {
  queryClient: QueryClient;
}
```

- [ ] **Step 3: `apps/backstage/src/router.tsx`**

```tsx
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "./lib/query-client";

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 4: `apps/backstage/src/routes/__root.tsx`**

```tsx
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import type { RouterContext } from "../lib/router-context";
import { queryClient } from "../lib/query-client";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 5: `apps/backstage/src/routes/index.tsx` (temporary placeholder)**

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => <div style={{ padding: 24 }}>Backstage bootstrap OK</div>,
});
```

- [ ] **Step 6: `apps/backstage/src/main.tsx`**

```tsx
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

- [ ] **Step 7: Remove the placeholder index module**

Run: `git rm apps/backstage/src/index.ts apps/backstage/src/index.test.ts`

- [ ] **Step 8: Generate the route tree (bypasses tsc-first ordering)**

Run: `pnpm --filter backstage exec vite build`
Expected: the plugin writes `apps/backstage/src/routeTree.gen.ts`, then the build bundles successfully (`dist/` produced).

- [ ] **Step 9: Run full CI for the app**

Run: `pnpm --filter backstage run ci`
Expected: eslint clean, `tsc --noEmit` passes, vitest reports no tests (passWithNoTests).

- [ ] **Step 10: Smoke-check dev render (manual, optional)**

Run: `pnpm --filter backstage dev` then open the printed localhost URL; confirm "Backstage bootstrap OK". Ctrl-C to stop.

- [ ] **Step 11: Commit**

```bash
git add apps/backstage/src apps/backstage/.gitignore 2>/dev/null; \
git add -A apps/backstage
git commit -m "chore(backstage): app shell — router, query provider, entry"
```

### Task 4: Branch 1 verification + PR

- [ ] **Step 1: Repo-wide gates**

Run: `pnpm format && pnpm --filter backstage run ci`
Expected: prettier clean (run `pnpm format:fix` if not), backstage ci green.

- [ ] **Step 2: Push + open PR**

```bash
git push -u origin chore/backstage-bootstrap
gh pr create --base master --title "chore(backstage): bootstrap app shell" \
  --body "$(cat <<'EOF'
## Summary
- Bootstrap apps/backstage: Vite + TanStack Router + Tailwind v4 mirroring spotlight
- Add QueryClientProvider, typed router, placeholder route

## Test plan
- [ ] backstage-ci pass
- [ ] /security-review (n/a — no auth/rules/functions in this branch)
EOF
)"
```

- [ ] **Step 3: Run PR tests**

Run: `pnpm pr-tests`
Expected: format + all ci + knip + audit pass.

---

# BRANCH 2 — `feat/backstage-auth`

- [ ] **Step 0: Branch off branch 1 (stacked — needs the bootstrap)**

```bash
git checkout -b feat/backstage-auth
```

### Task 5: Auth error mapping (pure, TDD)

**Files:** Create `src/lib/auth/auth-errors.ts`, `src/lib/auth/auth-errors.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backstage/src/lib/auth/auth-errors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FirebaseError } from "firebase/app";
import { authErrorMessage } from "./auth-errors";

describe("authErrorMessage", () => {
  it("maps invalid-credential to a Spanish message", () => {
    const err = new FirebaseError("auth/invalid-credential", "raw");
    expect(authErrorMessage(err)).toBe("Correo o contraseña incorrectos.");
  });

  it("maps too-many-requests", () => {
    const err = new FirebaseError("auth/too-many-requests", "raw");
    expect(authErrorMessage(err)).toBe("Demasiados intentos. Espera un momento e intenta de nuevo.");
  });

  it("falls back to a generic message for unknown codes", () => {
    const err = new FirebaseError("auth/some-new-code", "raw");
    expect(authErrorMessage(err)).toBe("No se pudo iniciar sesión. Intenta de nuevo.");
  });

  it("falls back to generic for non-Firebase errors", () => {
    expect(authErrorMessage(new Error("boom"))).toBe(
      "No se pudo iniciar sesión. Intenta de nuevo.",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/lib/auth/auth-errors.test.ts`
Expected: FAIL — cannot find module `./auth-errors`.

- [ ] **Step 3: Write `apps/backstage/src/lib/auth/auth-errors.ts`**

```ts
import { FirebaseError } from "firebase/app";

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/invalid-email": "El correo no es válido.",
  "auth/user-disabled": "Esta cuenta está deshabilitada.",
  "auth/too-many-requests": "Demasiados intentos. Espera un momento e intenta de nuevo.",
  "auth/network-request-failed": "Error de red. Revisa tu conexión.",
};

const GENERIC = "No se pudo iniciar sesión. Intenta de nuevo.";

export function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return MESSAGES[error.code] ?? GENERIC;
  }
  return GENERIC;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/lib/auth/auth-errors.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/lib/auth/auth-errors.ts apps/backstage/src/lib/auth/auth-errors.test.ts
git commit -m "feat(backstage): map Firebase auth errors to Spanish messages"
```

### Task 6: Auth store factory (TDD with mocked firebase/auth)

**Files:** Create `src/lib/auth/auth-store.ts`, `src/lib/auth/auth-store.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backstage/src/lib/auth/auth-store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Auth, User } from "firebase/auth";

const onAuthStateChanged = vi.fn();
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (auth: Auth, cb: (u: User | null) => void) => onAuthStateChanged(auth, cb),
}));

import { createAuthStore } from "./auth-store";

function lastCallback(): (u: User | null) => void {
  return onAuthStateChanged.mock.calls.at(-1)![1];
}

describe("createAuthStore", () => {
  beforeEach(() => onAuthStateChanged.mockClear());

  it("starts in pending with no user", () => {
    const store = createAuthStore({} as Auth);
    expect(store.getState()).toEqual({ status: "pending", user: null });
  });

  it("becomes authenticated when a user is emitted", () => {
    const store = createAuthStore({} as Auth);
    const user = { uid: "u1" } as User;
    lastCallback()(user);
    expect(store.getState()).toEqual({ status: "authenticated", user });
  });

  it("becomes unauthenticated when null is emitted", () => {
    const store = createAuthStore({} as Auth);
    lastCallback()(null);
    expect(store.getState()).toEqual({ status: "unauthenticated", user: null });
  });

  it("resolves ready on first emission", async () => {
    const store = createAuthStore({} as Auth);
    lastCallback()(null);
    await expect(store.ready).resolves.toBeUndefined();
  });

  it("notifies subscribers on change", () => {
    const store = createAuthStore({} as Auth);
    const listener = vi.fn();
    store.subscribe(listener);
    lastCallback()({ uid: "u1" } as User);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/lib/auth/auth-store.test.ts`
Expected: FAIL — cannot find module `./auth-store`.

- [ ] **Step 3: Write `apps/backstage/src/lib/auth/auth-store.ts`**

```ts
import { onAuthStateChanged, type Auth, type User } from "firebase/auth";

export type AuthStatus = "pending" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  user: User | null;
}

export interface AuthStore {
  ready: Promise<void>;
  getState: () => AuthState;
  subscribe: (listener: () => void) => () => void;
}

export function createAuthStore(auth: Auth): AuthStore {
  let state: AuthState = { status: "pending", user: null };
  const listeners = new Set<() => void>();
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  onAuthStateChanged(auth, (user) => {
    state = { status: user ? "authenticated" : "unauthenticated", user };
    resolveReady();
    listeners.forEach((listener) => listener());
  });

  return {
    ready,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/lib/auth/auth-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/lib/auth/auth-store.ts apps/backstage/src/lib/auth/auth-store.test.ts
git commit -m "feat(backstage): auth store over onAuthStateChanged"
```

### Task 7: Guard helper (pure, TDD)

**Files:** Create `src/lib/auth/guard.ts`, `src/lib/auth/guard.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backstage/src/lib/auth/guard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { User } from "firebase/auth";
import { authRedirect } from "./guard";

describe("authRedirect", () => {
  it("returns null when a user is present", () => {
    expect(authRedirect({ uid: "u1" } as User, "/members")).toBeNull();
  });

  it("returns a login redirect carrying the intended href when no user", () => {
    expect(authRedirect(null, "/members?page=2")).toEqual({
      to: "/login",
      search: { redirect: "/members?page=2" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/lib/auth/guard.test.ts`
Expected: FAIL — cannot find module `./guard`.

- [ ] **Step 3: Write `apps/backstage/src/lib/auth/guard.ts`**

```ts
import type { User } from "firebase/auth";

export interface LoginRedirect {
  to: "/login";
  search: { redirect: string };
}

export function authRedirect(user: User | null, href: string): LoginRedirect | null {
  if (user) return null;
  return { to: "/login", search: { redirect: href } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/lib/auth/guard.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/lib/auth/guard.ts apps/backstage/src/lib/auth/guard.test.ts
git commit -m "feat(backstage): pure auth-redirect guard helper"
```

### Task 8: Sign-in / sign-out wrappers + auth singleton

**Files:** Create `src/lib/auth/sign-in.ts`, `src/lib/auth/sign-out.ts`, `src/lib/auth/auth.ts`

> These three touch the env-bound `getFirebase()` singleton, so they are not unit-tested in isolation (the boundary they wrap — `signInWithEmailAndPassword` — is Firebase's). They are exercised via the login-form test (Task 10) which mocks `./sign-in`.

- [ ] **Step 1: `apps/backstage/src/lib/auth/sign-in.ts`**

```ts
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebase } from "@luminova/firebase";

export async function signIn(email: string, password: string): Promise<void> {
  const { auth } = getFirebase();
  await signInWithEmailAndPassword(auth, email, password);
}
```

- [ ] **Step 2: `apps/backstage/src/lib/auth/sign-out.ts`**

```ts
import { signOut } from "firebase/auth";
import { getFirebase } from "@luminova/firebase";

export async function signOutUser(): Promise<void> {
  const { auth } = getFirebase();
  await signOut(auth);
}
```

- [ ] **Step 3: `apps/backstage/src/lib/auth/auth.ts`**

```ts
import { useSyncExternalStore } from "react";
import { getFirebase } from "@luminova/firebase";
import { createAuthStore, type AuthState } from "./auth-store";

export const authStore = createAuthStore(getFirebase().auth);

export function useAuth(): AuthState {
  return useSyncExternalStore(authStore.subscribe, authStore.getState, authStore.getState);
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter backstage run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/lib/auth/sign-in.ts apps/backstage/src/lib/auth/sign-out.ts apps/backstage/src/lib/auth/auth.ts
git commit -m "feat(backstage): firebase sign-in/out wrappers + auth singleton"
```

### Task 9: Login schema + form (TDD)

**Files:** Create `src/features/auth/types/login-schema.ts`, `src/features/auth/components/login-form.tsx`, `src/features/auth/components/login-form.test.tsx`

- [ ] **Step 1: `apps/backstage/src/features/auth/types/login-schema.ts`**

```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Ingresa un correo válido."),
  password: z.string().min(1, "Ingresa tu contraseña."),
});

export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 2: Write the failing form test**

`apps/backstage/src/features/auth/components/login-form.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FirebaseError } from "firebase/app";

const signIn = vi.fn();
vi.mock("../../../lib/auth/sign-in", () => ({ signIn: (e: string, p: string) => signIn(e, p) }));

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  beforeEach(() => signIn.mockReset());

  it("shows a validation error for an invalid email", async () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "nope");
    await userEvent.type(screen.getByLabelText(/contraseña/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));
    expect(await screen.findByText("Ingresa un correo válido.")).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("calls onSuccess after a successful sign-in", async () => {
    signIn.mockResolvedValueOnce(undefined);
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.type(screen.getByLabelText(/contraseña/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(signIn).toHaveBeenCalledWith("admin@jci.bo", "secret");
  });

  it("renders a mapped error when sign-in fails", async () => {
    signIn.mockRejectedValueOnce(new FirebaseError("auth/invalid-credential", "raw"));
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.type(screen.getByLabelText(/contraseña/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));
    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter backstage exec vitest run src/features/auth/components/login-form.test.tsx`
Expected: FAIL — cannot find module `./login-form`.

- [ ] **Step 4: Write `apps/backstage/src/features/auth/components/login-form.tsx`**

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input } from "@luminova/ui";
import { loginSchema, type LoginInput } from "../types/login-schema";
import { signIn } from "../../../lib/auth/sign-in";
import { authErrorMessage } from "../../../lib/auth/auth-errors";

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
      onSuccess();
    } catch (error) {
      setFormError(authErrorMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field label="Correo" htmlFor="email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-err" : undefined}
          {...register("email")}
        />
      </Field>
      <Field label="Contraseña" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-err" : undefined}
          {...register("password")}
        />
      </Field>
      {formError && (
        <div role="alert" className="text-[13px] text-[#c0392b]">
          {formError}
        </div>
      )}
      <Button as="button" type="submit" className="w-full justify-center">
        {isSubmitting ? "Ingresando…" : "Iniciar sesión"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter backstage exec vitest run src/features/auth/components/login-form.test.tsx`
Expected: PASS (3 tests). If the submit button label match fails because the button shows "Ingresando…" mid-submit, the `findByText`/`name` matchers still resolve on the settled state; keep the accessible name `/iniciar sesión/i` for the click target.

- [ ] **Step 6: Add deps used here if missing**

`react-hook-form`, `@hookform/resolvers`, and `zod` are required. Resolve via `secure-dep-vetting` (pin `zod` exact; caret the others):

```bash
pnpm --filter backstage add react-hook-form @hookform/resolvers zod
```

Re-run Step 5 after install.

- [ ] **Step 7: Commit**

```bash
git add apps/backstage/src/features/auth apps/backstage/package.json pnpm-lock.yaml
git commit -m "feat(backstage): login form with RHF + Zod and error mapping"
```

### Task 10: Pending screen + sidebar components

**Files:** Create `src/components/pending-screen.tsx`, `src/components/app-sidebar.tsx`

- [ ] **Step 1: `apps/backstage/src/components/pending-screen.tsx`**

```tsx
import { LogoLockup } from "@luminova/ui";

export function PendingScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface">
      <div className="animate-pulse opacity-70">
        <LogoLockup />
      </div>
    </div>
  );
}
```

> If `LogoLockup` requires props, fall back to a plain centered text "Cargando…". Verify the export signature in `packages/ui/src/components/logo-lockup.tsx` at execution.

- [ ] **Step 2: `apps/backstage/src/components/app-sidebar.tsx`**

```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@luminova/ui";
import { signOutUser } from "../lib/auth/sign-out";

export function AppSidebar() {
  const navigate = useNavigate();

  const onLogout = async () => {
    await signOutUser();
    await navigate({ to: "/login" });
  };

  return (
    <aside className="flex w-60 flex-col gap-6 border-r border-line bg-surface p-5">
      <div className="text-[13px] font-semibold tracking-wider text-ink-2 uppercase">
        JCI Oriente
      </div>
      <nav className="flex flex-col gap-1">
        <Link
          to="/"
          className="rounded-[8px] px-3 py-2 text-[15px] text-ink-1 hover:bg-surface-3 [&.active]:bg-surface-3 [&.active]:font-semibold"
        >
          Panel
        </Link>
      </nav>
      <div className="mt-auto">
        <Button as="button" type="button" variant="secondary" size="sm" onClick={onLogout}>
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter backstage run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backstage/src/components
git commit -m "feat(backstage): pending screen + app sidebar"
```

### Task 11: Router context + router wiring for auth

**Files:** Modify `src/lib/router-context.ts`, `src/router.tsx`, `src/main.tsx`

- [ ] **Step 1: Extend `apps/backstage/src/lib/router-context.ts`**

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { AuthStore } from "./auth/auth-store";

export interface RouterContext {
  queryClient: QueryClient;
  auth: AuthStore;
}
```

- [ ] **Step 2: Update `apps/backstage/src/router.tsx`**

```tsx
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "./lib/query-client";
import { authStore } from "./lib/auth/auth";
import { PendingScreen } from "./components/pending-screen";

export const router = createRouter({
  routeTree,
  context: { queryClient, auth: authStore },
  defaultPreload: "intent",
  defaultPendingComponent: PendingScreen,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 3: Update `apps/backstage/src/main.tsx` (invalidate on auth change)**

```tsx
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { authStore } from "./lib/auth/auth";

authStore.subscribe(() => {
  void router.invalidate();
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

- [ ] **Step 4: Commit**

```bash
git add apps/backstage/src/lib/router-context.ts apps/backstage/src/router.tsx apps/backstage/src/main.tsx
git commit -m "feat(backstage): wire auth store into router context + invalidation"
```

### Task 12: Auth + app routes

**Files:** Create `src/routes/_auth.tsx`, `src/routes/_auth.login.tsx`, `src/routes/_app.tsx`, `src/routes/_app.index.tsx`. Delete `src/routes/index.tsx`.

- [ ] **Step 1: Remove the branch-1 placeholder route**

Run: `git rm apps/backstage/src/routes/index.tsx`

- [ ] **Step 2: `apps/backstage/src/routes/_auth.tsx`**

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-2 p-6">
      <div className="w-full max-w-[380px] rounded-card border border-line bg-surface p-8 shadow-[0_24px_48px_-24px_rgba(19,15,45,0.18)]">
        <h1 className="mb-6 text-[22px] font-semibold text-ink-1">Backstage</h1>
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `apps/backstage/src/routes/_auth.login.tsx`**

```tsx
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { LoginForm } from "../features/auth/components/login-form";

interface LoginSearch {
  redirect?: string;
}

export const Route = createFileRoute("/_auth/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const { redirect } = Route.useSearch();

  return <LoginForm onSuccess={() => router.history.push(redirect ?? "/")} />;
}
```

> `router.history.push` accepts an arbitrary in-app href (the validated `redirect`), sidestepping typed-route constraints on `navigate({ to })`. After sign-in the user is authenticated, the auth store invalidates the router, and the `_app` guard admits them.

- [ ] **Step 4: `apps/backstage/src/routes/_app.tsx`**

```tsx
import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { authRedirect } from "../lib/auth/guard";
import { AppSidebar } from "../components/app-sidebar";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    await context.auth.ready;
    const { user } = context.auth.getState();
    const target = authRedirect(user, location.href);
    if (target) throw redirect(target);
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="flex min-h-dvh">
      <AppSidebar />
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: `apps/backstage/src/routes/_app.index.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "../lib/auth/auth";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-[28px] font-semibold text-ink-1">Panel</h2>
      <p className="text-ink-2">Sesión iniciada como {user?.email ?? "—"}.</p>
    </div>
  );
}
```

- [ ] **Step 6: Regenerate route tree + typecheck**

Run: `pnpm --filter backstage exec vite build`
Expected: `routeTree.gen.ts` regenerates with `_auth`, `_auth/login`, `_app`, `_app/` routes; build succeeds.

- [ ] **Step 7: Run full app CI**

Run: `pnpm --filter backstage run ci`
Expected: eslint clean, tsc passes, all vitest tests green (auth-errors, auth-store, guard, login-form).

- [ ] **Step 8: Commit**

```bash
git add -A apps/backstage
git commit -m "feat(backstage): auth + app routes with beforeLoad guard"
```

### Task 13: Manual emulator verification

- [ ] **Step 1: Prep env + emulators**

Confirm `apps/backstage/.env.local` has `VITE_FIREBASE_EMULATOR_ENABLED=true` (copy from `.env.local.example`). In a separate terminal: `firebase emulators:start`, then `pnpm seed:emulator`. Create a test user in the Auth emulator UI (localhost:4100) if none exists.

- [ ] **Step 2: Exercise the flow**

Run: `pnpm --filter backstage dev`. Verify: visiting `/` while logged out bounces to `/login?redirect=%2F`; bad credentials show the Spanish error; good credentials land on the panel showing the email; reload stays authenticated (no login flash); "Cerrar sesión" returns to `/login`; deep-linking `/` after a session expiry returns there post-login.

- [ ] **Step 3: Note results in the PR description.** No commit (manual check).

### Task 14: Branch 2 verification, security review, PR

- [ ] **Step 1: Repo-wide gates**

Run: `pnpm format && pnpm --filter backstage run ci`
Expected: clean (run `pnpm format:fix` if needed).

- [ ] **Step 2: Security review (REQUIRED — auth boundary)**

Run the `/security-review` skill on the branch diff, and dispatch the `firestore-security-reviewer` subagent. Address Critical/High findings before the PR.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/backstage-auth
gh pr create --base master --title "feat(backstage): auth foundation + protected shell" \
  --body "$(cat <<'EOF'
## Summary
- onAuthStateChanged auth store fed into TanStack Router context
- /login (RHF + Zod, Spanish error mapping), _app guard via beforeLoad
- Redirect-to-intended-route, branded pending component, logout

## Test plan
- [ ] backstage-ci pass
- [ ] /security-review run (auth boundary)
- [ ] Manual emulator flow verified
EOF
)"
```

- [ ] **Step 4: Run PR tests**

Run: `pnpm pr-tests`
Expected: format + ci + knip + audit pass.

---

## Self-Review Notes

- **Spec coverage:** bootstrap (Tasks 1–4), auth store + listener→context (6, 11), redirect-to-intended (7, 12), Spanish error mapping form-level (5, 9), QueryClientProvider in branch 1 (3), branded pending component (10, 11), login UX + guard (9, 12), TDD on the four pure/component units (5, 6, 7, 9), manual emulator e2e (13), security review (14). All spec sections map to tasks.
- **Known execution risk:** TanStack file-route ids and `router.history.push` typing may need minor adjustment against the installed `@tanstack/react-router` version — verify against generated `routeTree.gen.ts`. `LogoLockup` prop signature to confirm in Task 10.
- **Deps deferred to where first used:** RHF/Zod/resolvers added in Task 9, not branch 1 — they belong to auth, not bootstrap.
