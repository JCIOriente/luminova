# Auth Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add remember-me persistence, a branded password-recovery flow, a real password policy (login + reset), a blue/animated brand panel for recovery pages, and the App Check ops checklist — all in `apps/backstage`.

**Architecture:** Client-only changes in `apps/backstage`. `lib/auth/*` holds framework-free Firebase calls (one fn per file); `features/auth/{types,components}` holds schemas + UI built from `@luminova/ui`; routes are file-based under the `_auth` split-screen layout. No `@luminova/ui|types`, `firestore.rules`, or `apps/beacon` changes.

**Tech Stack:** React 19, TanStack Router/Query, RHF + Zod, Firebase Auth (`setPersistence`, `sendPasswordResetEmail`, `verifyPasswordResetCode`, `confirmPasswordReset`), `@luminova/ui`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-07-auth-hardening-design.md`

**Commands:** `pnpm --filter backstage run ci` (eslint + tsc + vitest). Run after each task.

---

### Task 0: Branch

- [ ] **Step 1:** From `feat/login-redesign`, create the work branch.

```bash
git checkout feat/login-redesign
git checkout -b feat/auth-hardening
```

---

### Task 1: Password policy schema

**Files:**
- Create: `apps/backstage/src/features/auth/types/password-policy.ts`
- Test: `apps/backstage/src/features/auth/types/password-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { PASSWORD_RULES, passwordSchema } from "./password-policy";

describe("passwordSchema", () => {
  it("accepts a compliant password", () => {
    expect(passwordSchema.safeParse("Abc123").success).toBe(true);
  });
  it.each([
    ["short1A", "Abc1"],
    ["no upper", "abc123"],
    ["no lower", "ABC123"],
    ["no digit", "Abcdef"],
  ])("rejects (%s)", (_label, value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });
  it("exposes four rules", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual(["len", "lower", "upper", "digit"]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './password-policy'`)

Run: `pnpm --filter backstage exec vitest run src/features/auth/types/password-policy.test.ts`

- [ ] **Step 3: Implement**

```ts
import { z } from "zod";

export const PASSWORD_RULES = [
  { id: "len", label: "Al menos 6 caracteres", test: (v: string) => v.length >= 6 },
  { id: "lower", label: "Una letra minúscula", test: (v: string) => /[a-z]/.test(v) },
  { id: "upper", label: "Una letra mayúscula", test: (v: string) => /[A-Z]/.test(v) },
  { id: "digit", label: "Un número", test: (v: string) => /[0-9]/.test(v) },
] as const;

export const passwordSchema = z.string().superRefine((value, ctx) => {
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(value)) {
      ctx.addIssue({ code: "custom", message: `La contraseña necesita: ${rule.label.toLowerCase()}.` });
    }
  }
});
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(backstage): password policy schema"`

---

### Task 2: Remember-me persistence

**Files:**
- Modify: `apps/backstage/src/lib/auth/sign-in.ts`
- Test: `apps/backstage/src/lib/auth/sign-in.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const setPersistence = vi.fn(() => Promise.resolve());
const signInWithEmailAndPassword = vi.fn(() => Promise.resolve());
vi.mock("firebase/auth", () => ({
  setPersistence: (...a: unknown[]) => setPersistence(...a),
  signInWithEmailAndPassword: (...a: unknown[]) => signInWithEmailAndPassword(...a),
  browserLocalPersistence: { type: "LOCAL" },
  browserSessionPersistence: { type: "SESSION" },
}));
vi.mock("@luminova/firebase", () => ({ getFirebase: () => ({ auth: { id: "auth" } }) }));

import { signIn } from "./sign-in";
import { browserLocalPersistence, browserSessionPersistence } from "firebase/auth";

describe("signIn", () => {
  beforeEach(() => {
    setPersistence.mockClear();
    signInWithEmailAndPassword.mockClear();
  });
  it("uses local persistence when remember is true", async () => {
    await signIn("a@b.co", "pw", true);
    expect(setPersistence).toHaveBeenCalledWith({ id: "auth" }, browserLocalPersistence);
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith({ id: "auth" }, "a@b.co", "pw");
  });
  it("uses session persistence when remember is false", async () => {
    await signIn("a@b.co", "pw", false);
    expect(setPersistence).toHaveBeenCalledWith({ id: "auth" }, browserSessionPersistence);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (signIn signature mismatch / persistence not called)
- [ ] **Step 3: Implement**

```ts
import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { getFirebase } from "@luminova/firebase";

export async function signIn(email: string, password: string, remember: boolean): Promise<void> {
  const { auth } = getFirebase();
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  await signInWithEmailAndPassword(auth, email, password);
}
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat(backstage): remember-me auth persistence`

---

### Task 3: Login schema/form — policy, remember, forgot link, CEL copy

**Files:**
- Modify: `apps/backstage/src/features/auth/types/login-schema.ts`
- Modify: `apps/backstage/src/features/auth/components/login-form.tsx`
- Modify: `apps/backstage/src/features/auth/components/login-form.test.tsx`

- [ ] **Step 1: login-schema** — use the policy for password:

```ts
import { z } from "zod";
import { passwordSchema } from "./password-policy";

export const loginSchema = z.object({
  email: z.string().email("Ingresa un correo válido."),
  password: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 2: login-form** — (a) add `useNavigate`/`Link` import from `@tanstack/react-router`; (b) pass `remember` to `signIn`; (c) replace the inert "¿La olvidaste?" `<button>` with `<Link to="/forgot-password" className="text-[12.5px] font-semibold text-jci-blue transition-colors hover:text-jci-blue-2">¿La olvidaste?</Link>`; (d) change `signIn(values.email, values.password)` → `signIn(values.email, values.password, remember)`; (e) footnote copy:

```tsx
<p className="mt-9 text-[12.5px] leading-[1.5] text-ink-3">
  ¿Aún no tienes acceso? La cuenta la crea la directiva.{" "}
  <a
    href="mailto:jci.orienteolm@gmail.com"
    className="font-semibold text-jci-blue hover:text-jci-blue-2"
  >
    Escríbele al CEL
  </a>
  .
</p>
```

Import line becomes: `import { Link } from "@tanstack/react-router";` (add near top).

- [ ] **Step 3: login-form.test** — the success/error tests now need a policy-compliant password. Replace `"secret"` and `"wrong"` with `"Secret1"`. Add a test for the policy + forgot link:

```tsx
it("blocks submit for a password that violates the policy", async () => {
  render(<LoginForm onSuccess={vi.fn()} />);
  await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
  await userEvent.type(screen.getByLabelText("Contraseña"), "weak");
  await userEvent.click(screen.getByRole("button", { name: /entrar a backstage/i }));
  expect(await screen.findByText(/la contraseña necesita/i)).toBeInTheDocument();
  expect(signIn).not.toHaveBeenCalled();
});

it("links to the password recovery flow", () => {
  render(<LoginForm onSuccess={vi.fn()} />);
  expect(screen.getByRole("link", { name: /la olvidaste/i })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
});
```

The existing two passing-password tests assert `signIn` called with `("admin@jci.bo", "Secret1")` — update to the third arg: `expect(signIn).toHaveBeenCalledWith("admin@jci.bo", "Secret1", true)` (remember defaults to checked). The mock at top must accept three args: `signIn: (e: string, p: string, r: boolean) => signIn(e, p, r)`.

> **Router in tests:** `<Link>` needs a router context. Wrap renders with a memory router stub, OR mock `@tanstack/react-router` minimally:
> ```tsx
> vi.mock("@tanstack/react-router", () => ({
>   Link: ({ to, children, ...p }: { to: string; children: React.ReactNode }) => (
>     <a href={to} {...p}>{children}</a>
>   ),
> }));
> ```
> Use the mock (simplest; the form imports only `Link`).

- [ ] **Step 4: Run** `pnpm --filter backstage exec vitest run src/features/auth/components/login-form.test.tsx` — expect PASS
- [ ] **Step 5: Commit** `feat(backstage): login uses password policy + remember + recovery link`

---

### Task 4: AuthScreen layout + BrandSide tone + entrance motion

**Files:**
- Create: `apps/backstage/src/features/auth/components/auth-screen.tsx`
- Modify: `apps/backstage/src/features/auth/components/brand-side.tsx`
- Modify: `apps/backstage/src/routes/_auth.tsx`
- Modify: `apps/backstage/src/routes/_auth.login.tsx`

- [ ] **Step 1: AuthScreen** — owns the split grid + entrance motion. `animate-rise` (token in `@luminova/ui` theme) staggers content; reduced-motion handled globally in `styles.css`.

```tsx
import type { ReactNode } from "react";

interface AuthScreenProps {
  brand: ReactNode;
  children: ReactNode;
}

export function AuthScreen({ brand, children }: AuthScreenProps) {
  return (
    <div className="grid min-h-dvh grid-cols-1 bg-surface lg:grid-cols-[1.04fr_1fr]">
      {brand}
      <div className="flex animate-rise items-center justify-center overflow-y-auto bg-surface-2 px-6 py-12 motion-reduce:animate-none sm:px-10">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: BrandSide tone** — add `tone?: "dark" | "blue"` + optional copy props; keep current defaults for login. Blue variant: `bg-jci-blue`, `LogoLockup` `on-blue`, white/teal accents, lighter glow, `animate-rise` on the copy.

```tsx
import { LogoLockup, RippleBackground } from "@luminova/ui";

interface BrandSideProps {
  tone?: "dark" | "blue";
  eyebrow?: string;
  title?: ReactNode;
  lead?: string;
}

const META = ["JCI Oriente", "Santa Cruz · Bolivia", "Desde 1993"];

export function BrandSide({
  tone = "dark",
  eyebrow = "Portal de la directiva",
  title = (
    <>
      Sé el <b className="font-semibold">cambio.</b>
    </>
  ),
  lead = "El panel interno de JCI Oriente. Coordina miembros, eventos y proyectos del capítulo desde un solo lugar.",
}: BrandSideProps) {
  const blue = tone === "blue";
  return (
    <aside
      className={cn(
        "relative isolate hidden flex-col items-start justify-between overflow-hidden p-12 text-on-dark-1 lg:flex",
        blue ? "bg-jci-blue" : "bg-jci-black",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: blue
            ? "radial-gradient(120% 90% at 18% 8%, rgba(255,255,255,0.18), transparent 56%), radial-gradient(90% 80% at 92% 100%, rgba(87,188,188,0.22), transparent 52%)"
            : "radial-gradient(120% 90% at 18% 8%, rgba(0,151,215,0.16), transparent 56%), radial-gradient(90% 80% at 92% 100%, rgba(87,188,188,0.12), transparent 52%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <RippleBackground variant="hero-center" color="#ffffff" opacity={blue ? 0.16 : 0.1} />
      </div>

      <LogoLockup variant={blue ? "on-blue" : "inverted"} size="sm" />

      <div className="max-w-[480px] animate-rise motion-reduce:animate-none">
        <div
          className={cn(
            "mb-6 inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.22em] before:h-px before:w-6 before:bg-current before:opacity-70",
            blue ? "text-white/85" : "text-jci-blue-75",
          )}
        >
          {eyebrow}
        </div>
        <h2 className="text-[clamp(40px,4.6vw,60px)] font-light leading-[1.02] -tracking-[0.03em]">
          {title}
        </h2>
        <p className="mt-4 font-serif text-[17px] italic text-on-dark-3">Become the change.</p>
        <p className="mt-6 max-w-[420px] text-[16.5px] leading-[1.62] text-on-dark-2">{lead}</p>
      </div>

      <div className="flex w-full items-center gap-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-on-dark-3">
        {META.map((label, i) => (
          <span key={label} className="inline-flex items-center gap-4">
            {i > 0 && (
              <span
                className={cn("h-1 w-1 shrink-0 rounded-full", blue ? "bg-white" : "bg-jci-blue")}
              />
            )}
            {label}
          </span>
        ))}
      </div>
    </aside>
  );
}
```

Add imports: `import type { ReactNode } from "react";` and `import { cn } from "@luminova/ui";`.

- [ ] **Step 3: `_auth.tsx`** — strip the grid (now in AuthScreen); keep only the guard + `<Outlet />`:

```tsx
import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ context }) => {
    await context.auth.ready;
    if (context.auth.getState().user) {
      throw redirect({ to: "/" });
    }
  },
  component: Outlet,
});
```

- [ ] **Step 4: `_auth.login.tsx`** — compose AuthScreen + dark BrandSide + LoginForm:

```tsx
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AuthScreen } from "../features/auth/components/auth-screen";
import { BrandSide } from "../features/auth/components/brand-side";
import { LoginForm } from "../features/auth/components/login-form";
import { safeRedirect } from "../lib/auth/safe-redirect";

interface LoginSearch {
  redirect?: string;
}

export const Route = createFileRoute("/_auth/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: safeRedirect(search.redirect),
  }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const { redirect } = Route.useSearch();
  return (
    <AuthScreen brand={<BrandSide tone="dark" />}>
      <LoginForm onSuccess={() => router.history.push(redirect ?? "/")} />
    </AuthScreen>
  );
}
```

- [ ] **Step 5: Run** `pnpm --filter backstage run ci` — expect PASS (build proves Tailwind classes resolve).
- [ ] **Step 6: Commit** `feat(backstage): AuthScreen layout + BrandSide tone + entrance motion`

---

### Task 5: Auth error messages for reset codes

**Files:**
- Modify: `apps/backstage/src/lib/auth/auth-errors.ts`

- [ ] **Step 1:** Add to the `MESSAGES` map:

```ts
"auth/expired-action-code": "El enlace expiró. Solicita uno nuevo.",
"auth/invalid-action-code": "El enlace no es válido o ya se usó. Solicita uno nuevo.",
"auth/weak-password": "La contraseña es demasiado débil.",
"auth/missing-email": "Ingresa tu correo.",
```

- [ ] **Step 2: Commit** `feat(backstage): map password-reset error codes`

---

### Task 6: Forgot-password request flow

**Files:**
- Create: `apps/backstage/src/lib/auth/request-password-reset.ts`
- Create: `apps/backstage/src/features/auth/components/forgot-password-form.tsx`
- Create: `apps/backstage/src/features/auth/components/forgot-password-form.test.tsx`
- Create: `apps/backstage/src/routes/_auth.forgot-password.tsx`

- [ ] **Step 1: request-password-reset.ts**

```ts
import { sendPasswordResetEmail } from "firebase/auth";
import { getFirebase } from "@luminova/firebase";

export async function requestPasswordReset(email: string): Promise<void> {
  const { auth } = getFirebase();
  await sendPasswordResetEmail(auth, email);
}
```

- [ ] **Step 2: forgot-password-form.test (failing)**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const requestPasswordReset = vi.fn();
vi.mock("../../../lib/auth/request-password-reset", () => ({
  requestPasswordReset: (e: string) => requestPasswordReset(e),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import { ForgotPasswordForm } from "./forgot-password-form";

describe("ForgotPasswordForm", () => {
  beforeEach(() => requestPasswordReset.mockReset());

  it("shows a generic success after sending", async () => {
    requestPasswordReset.mockResolvedValueOnce(undefined);
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.click(screen.getByRole("button", { name: /enviar enlace/i }));
    await waitFor(() => expect(screen.getByText(/revisa tu correo/i)).toBeInTheDocument());
    expect(requestPasswordReset).toHaveBeenCalledWith("admin@jci.bo");
  });

  it("shows the same success even when the call fails (no enumeration)", async () => {
    requestPasswordReset.mockRejectedValueOnce(new Error("nope"));
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/correo/i), "ghost@jci.bo");
    await userEvent.click(screen.getByRole("button", { name: /enviar enlace/i }));
    await waitFor(() => expect(screen.getByText(/revisa tu correo/i)).toBeInTheDocument());
  });

  it("blocks an invalid email", async () => {
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/correo/i), "nope");
    await userEvent.click(screen.getByRole("button", { name: /enviar enlace/i }));
    expect(await screen.findByText("Ingresa un correo válido.")).toBeInTheDocument();
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: forgot-password-form.tsx**

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Button, Field, Icon, Input } from "@luminova/ui";
import { requestPasswordReset } from "../../../lib/auth/request-password-reset";

const schema = z.object({ email: z.string().email("Ingresa un correo válido.") });
type Input = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Input>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await requestPasswordReset(email);
    } catch {
      /* swallow — never reveal whether the account exists */
    }
    setSent(true);
  });

  if (sent) {
    return (
      <div className="flex w-full max-w-[392px] flex-col">
        <div className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.2em] text-jci-blue">
          Backstage · Recuperación
        </div>
        <h1 className="text-[31px] font-normal leading-[1.1] -tracking-[0.025em] text-ink-1">
          Revisa tu correo
        </h1>
        <p className="mt-2.5 text-[14.5px] leading-[1.5] text-ink-3">
          Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña.
          Revisa también la carpeta de spam.
        </p>
        <Link
          to="/login"
          className="mt-8 text-[13px] font-semibold text-jci-blue hover:text-jci-blue-2"
        >
          ← Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[392px] flex-col">
      <div className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.2em] text-jci-blue">
        Backstage · Recuperación
      </div>
      <h1 className="text-[31px] font-normal leading-[1.1] -tracking-[0.025em] text-ink-1">
        ¿Olvidaste tu contraseña?
      </h1>
      <p className="mt-2.5 text-[14.5px] leading-[1.5] text-ink-3">
        Ingresa tu correo y te enviaremos un enlace para crear una nueva.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-[18px]">
        <Field label="Correo electrónico" htmlFor="email" error={errors.email?.message}>
          <div className="group relative flex items-center">
            <span className="pointer-events-none absolute left-3.5 flex text-ink-3 transition-colors group-focus-within:text-jci-blue">
              {Icon.mail({ s: 19 })}
            </span>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="tu.nombre@jcioriente.bo"
              className="pl-11"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "email-err" : undefined}
              {...register("email")}
            />
          </div>
        </Field>

        <Button
          as="button"
          type="submit"
          disabled={isSubmitting}
          className="mt-2 w-full"
          iconRight={
            isSubmitting ? (
              <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <ArrowRight size={18} />
            )
          }
        >
          {isSubmitting ? "Enviando…" : "Enviar enlace"}
        </Button>
      </form>

      <Link
        to="/login"
        className="mt-9 text-[13px] font-semibold text-jci-blue hover:text-jci-blue-2"
      >
        ← Volver a iniciar sesión
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: route `_auth.forgot-password.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "../features/auth/components/auth-screen";
import { BrandSide } from "../features/auth/components/brand-side";
import { ForgotPasswordForm } from "../features/auth/components/forgot-password-form";

export const Route = createFileRoute("/_auth/forgot-password")({
  component: () => (
    <AuthScreen
      brand={
        <BrandSide
          tone="blue"
          eyebrow="Recuperación de acceso"
          title={
            <>
              Recupera tu <b className="font-semibold">acceso.</b>
            </>
          }
          lead="Te enviaremos un enlace seguro para crear una nueva contraseña y volver a coordinar al capítulo."
        />
      }
    >
      <ForgotPasswordForm />
    </AuthScreen>
  ),
});
```

- [ ] **Step 5: Run** `pnpm --filter backstage exec vitest run src/features/auth/components/forgot-password-form.test.tsx` — expect PASS
- [ ] **Step 6: Commit** `feat(backstage): forgot-password request flow`

---

### Task 7: Reset-password flow (verify code + set new password)

**Files:**
- Create: `apps/backstage/src/lib/auth/confirm-password-reset.ts`
- Create: `apps/backstage/src/features/auth/types/reset-schema.ts`
- Create: `apps/backstage/src/features/auth/components/password-checklist.tsx`
- Create: `apps/backstage/src/features/auth/components/reset-password-form.tsx`
- Create: `apps/backstage/src/features/auth/components/reset-password-form.test.tsx`
- Create: `apps/backstage/src/routes/_auth.reset.tsx`

- [ ] **Step 1: confirm-password-reset.ts**

```ts
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { getFirebase } from "@luminova/firebase";

export async function verifyResetCode(oobCode: string): Promise<string> {
  const { auth } = getFirebase();
  return verifyPasswordResetCode(auth, oobCode);
}

export async function confirmReset(oobCode: string, newPassword: string): Promise<void> {
  const { auth } = getFirebase();
  await confirmPasswordReset(auth, oobCode, newPassword);
}
```

- [ ] **Step 2: reset-schema.ts**

```ts
import { z } from "zod";
import { passwordSchema } from "./password-policy";

export const resetSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export type ResetInput = z.infer<typeof resetSchema>;
```

- [ ] **Step 3: password-checklist.tsx**

```tsx
import { PASSWORD_RULES } from "../types/password-policy";
import { Icon } from "@luminova/ui";

export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li
            key={rule.id}
            className={ok ? "flex items-center gap-2 text-[12.5px] text-ok" : "flex items-center gap-2 text-[12.5px] text-ink-3"}
          >
            <span className={ok ? "text-ok" : "text-ink-4"}>
              {ok ? Icon.check({ s: 13 }) : Icon.close({ s: 13 })}
            </span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: reset-password-form.test (failing)**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const verifyResetCode = vi.fn();
const confirmReset = vi.fn();
vi.mock("../../../lib/auth/confirm-password-reset", () => ({
  verifyResetCode: (c: string) => verifyResetCode(c),
  confirmReset: (c: string, p: string) => confirmReset(c, p),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import { ResetPasswordForm } from "./reset-password-form";

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    verifyResetCode.mockReset();
    confirmReset.mockReset();
  });

  it("shows an error for an invalid code", async () => {
    verifyResetCode.mockRejectedValueOnce(new Error("bad"));
    render(<ResetPasswordForm oobCode="bad" />);
    expect(await screen.findByText(/el enlace no es válido/i)).toBeInTheDocument();
  });

  it("confirms a new compliant password", async () => {
    verifyResetCode.mockResolvedValueOnce("admin@jci.bo");
    confirmReset.mockResolvedValueOnce(undefined);
    render(<ResetPasswordForm oobCode="good" />);
    const pw = await screen.findByLabelText("Nueva contraseña");
    await userEvent.type(pw, "Secret1");
    await userEvent.type(screen.getByLabelText("Confirmar contraseña"), "Secret1");
    await userEvent.click(screen.getByRole("button", { name: /guardar contraseña/i }));
    await waitFor(() => expect(confirmReset).toHaveBeenCalledWith("good", "Secret1"));
    expect(await screen.findByText(/contraseña actualizada/i)).toBeInTheDocument();
  });

  it("rejects mismatched passwords", async () => {
    verifyResetCode.mockResolvedValueOnce("admin@jci.bo");
    render(<ResetPasswordForm oobCode="good" />);
    const pw = await screen.findByLabelText("Nueva contraseña");
    await userEvent.type(pw, "Secret1");
    await userEvent.type(screen.getByLabelText("Confirmar contraseña"), "Secret2");
    await userEvent.click(screen.getByRole("button", { name: /guardar contraseña/i }));
    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(confirmReset).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: reset-password-form.tsx**

```tsx
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Button, Field, Icon, Input } from "@luminova/ui";
import { resetSchema, type ResetInput } from "../types/reset-schema";
import { confirmReset, verifyResetCode } from "../../../lib/auth/confirm-password-reset";
import { authErrorMessage } from "../../../lib/auth/auth-errors";
import { PasswordChecklist } from "./password-checklist";

type Phase = "verifying" | "valid" | "invalid" | "done";

export function ResetPasswordForm({ oobCode }: { oobCode: string }) {
  const [phase, setPhase] = useState<Phase>("verifying");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetInput>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    let active = true;
    verifyResetCode(oobCode)
      .then(() => active && setPhase("valid"))
      .catch(() => active && setPhase("invalid"));
    return () => {
      active = false;
    };
  }, [oobCode]);

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await confirmReset(oobCode, password);
      setPhase("done");
    } catch (error) {
      setFormError(authErrorMessage(error));
    }
  });

  const shell = (children: React.ReactNode) => (
    <div className="flex w-full max-w-[392px] flex-col">
      <div className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.2em] text-jci-blue">
        Backstage · Nueva contraseña
      </div>
      {children}
    </div>
  );

  if (phase === "verifying") {
    return shell(<p className="text-[14.5px] text-ink-3">Validando el enlace…</p>);
  }

  if (phase === "invalid") {
    return shell(
      <>
        <h1 className="text-[31px] font-normal leading-[1.1] -tracking-[0.025em] text-ink-1">
          Enlace no válido
        </h1>
        <p className="mt-2.5 text-[14.5px] leading-[1.5] text-ink-3">
          El enlace no es válido o ya expiró. Solicita uno nuevo.
        </p>
        <Link
          to="/forgot-password"
          className="mt-8 text-[13px] font-semibold text-jci-blue hover:text-jci-blue-2"
        >
          Solicitar un nuevo enlace
        </Link>
      </>,
    );
  }

  if (phase === "done") {
    return shell(
      <>
        <h1 className="text-[31px] font-normal leading-[1.1] -tracking-[0.025em] text-ink-1">
          Contraseña actualizada
        </h1>
        <p className="mt-2.5 text-[14.5px] leading-[1.5] text-ink-3">
          Ya puedes iniciar sesión con tu nueva contraseña.
        </p>
        <Link
          to="/login"
          className="mt-8 text-[13px] font-semibold text-jci-blue hover:text-jci-blue-2"
        >
          Ir a iniciar sesión →
        </Link>
      </>,
    );
  }

  return shell(
    <>
      <h1 className="text-[31px] font-normal leading-[1.1] -tracking-[0.025em] text-ink-1">
        Crea una nueva contraseña
      </h1>
      <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-[18px]">
        <Field label="Nueva contraseña" htmlFor="password" error={errors.password?.message}>
          <div className="group relative flex items-center">
            <span className="pointer-events-none absolute left-3.5 flex text-ink-3 transition-colors group-focus-within:text-jci-blue">
              {Icon.lock({ s: 19 })}
            </span>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              className="pl-11"
              aria-invalid={errors.password ? true : undefined}
              {...register("password")}
            />
          </div>
        </Field>
        <PasswordChecklist value={watch("password")} />
        <Field
          label="Confirmar contraseña"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
        >
          <div className="group relative flex items-center">
            <span className="pointer-events-none absolute left-3.5 flex text-ink-3 transition-colors group-focus-within:text-jci-blue">
              {Icon.lock({ s: 19 })}
            </span>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              className="pl-11"
              aria-invalid={errors.confirmPassword ? true : undefined}
              {...register("confirmPassword")}
            />
          </div>
        </Field>
        {formError && (
          <div role="alert" className="text-[13px] text-error">
            {formError}
          </div>
        )}
        <Button
          as="button"
          type="submit"
          disabled={isSubmitting}
          className="mt-2 w-full"
          iconRight={
            isSubmitting ? (
              <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <ArrowRight size={18} />
            )
          }
        >
          {isSubmitting ? "Guardando…" : "Guardar contraseña"}
        </Button>
      </form>
    </>,
  );
}
```

- [ ] **Step 6: route `_auth.reset.tsx`** — parse `mode`/`oobCode`; treat anything but a `resetPassword` code with an oobCode as invalid (pass empty → form shows invalid):

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "../features/auth/components/auth-screen";
import { BrandSide } from "../features/auth/components/brand-side";
import { ResetPasswordForm } from "../features/auth/components/reset-password-form";

interface ResetSearch {
  mode?: string;
  oobCode?: string;
}

export const Route = createFileRoute("/_auth/reset")({
  validateSearch: (search: Record<string, unknown>): ResetSearch => ({
    mode: typeof search.mode === "string" ? search.mode : undefined,
    oobCode: typeof search.oobCode === "string" ? search.oobCode : undefined,
  }),
  component: ResetPage,
});

function ResetPage() {
  const { mode, oobCode } = Route.useSearch();
  const code = mode === "resetPassword" && oobCode ? oobCode : "";
  return (
    <AuthScreen
      brand={
        <BrandSide
          tone="blue"
          eyebrow="Nueva contraseña"
          title={
            <>
              Casi <b className="font-semibold">listo.</b>
            </>
          }
          lead="Elige una contraseña segura para proteger tu cuenta de la directiva."
        />
      }
    >
      <ResetPasswordForm oobCode={code} />
    </AuthScreen>
  );
}
```

> Note: an empty `code` makes `verifyResetCode("")` reject → the form shows the invalid state. Good.

- [ ] **Step 7: Run** `pnpm --filter backstage exec vitest run src/features/auth/components/reset-password-form.test.tsx` — expect PASS
- [ ] **Step 8: Commit** `feat(backstage): branded password-reset flow`

---

### Task 8: Docs + full CI + security review + PR

**Files:**
- Modify: `docs/firebase-setup.md` (App Check + reset action-URL ops checklist)
- Modify: `docs/roadmap.md` (G4 note + auth-hardening row)

- [ ] **Step 1: firebase-setup.md** — append an "App Check & password reset" section listing: create reCAPTCHA v3 key → register in App Check; set `VITE_APPCHECK_SITE_KEY` + per-dev `VITE_APPCHECK_DEBUG_TOKEN`; Authentication → Templates → Password reset → customize action URL → `https://<host>/reset`; localize the email template to Spanish; (later G4) enable App Check enforcement; ensure the seeded admin password meets the policy.

- [ ] **Step 2: roadmap.md** — under §G, mark G4 code-side scaffolded (pending keys); add an auth-hardening row under §B or §F noting remember-me + recovery + policy shipped.

- [ ] **Step 3: Full CI** `pnpm --filter backstage run ci` — expect PASS (eslint, tsc, vitest). Then `pnpm --filter backstage build` — expect built.

- [ ] **Step 4: Security review** — invoke `/security-review` on the diff (auth surface). Address any findings.

- [ ] **Step 5: Commit docs** `docs(backstage): App Check + reset ops checklist; roadmap`

- [ ] **Step 6: Push + PR** (base `feat/login-redesign`, since this stacks on it):

```bash
git push -u origin feat/auth-hardening
gh pr create --base feat/login-redesign --title "feat(backstage): auth hardening — remember-me, password recovery, password policy" --body "<see template>"
pnpm pr-tests
```

PR body:
```
## Summary
- Remember-me → Firebase auth persistence (local vs session)
- Branded password recovery: /forgot-password + /reset (verify oobCode → set new password)
- Password policy (min 6 + mixed case + digit) on login and reset, with a live requirements checklist
- Blue brand panel + entrance motion to differentiate recovery pages from login
- Footnote → CEL (jci.orienteolm@gmail.com)
- App Check (reCAPTCHA v3) ops checklist — code was already wired

## Test plan
- [ ] backstage-ci pass (eslint + tsc + vitest)
- [ ] /security-review run (auth surface)
- [ ] Ops (mine): reCAPTCHA v3 key + console reset action URL → /reset
```

---

## Self-review notes

- **Spec coverage:** remember-me (T2,T3), recovery request (T6), reset (T7), policy login+reset (T1,T3,T7), blue panel + motion (T4), CEL copy (T3), error codes (T5), App Check ops (T8). All covered.
- **Type consistency:** `signIn(email,password,remember)` used in T2/T3; `verifyResetCode`/`confirmReset` used in T7 test + form + route; `PASSWORD_RULES`/`passwordSchema` used in T1/T3/T7; `AuthScreen({brand,children})` + `BrandSide({tone,eyebrow,title,lead})` consistent T4/T6/T7.
- **Router-in-test:** forms importing `Link` mock `@tanstack/react-router` in their test files.
