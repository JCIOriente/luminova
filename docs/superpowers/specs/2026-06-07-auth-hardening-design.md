# Auth hardening — remember-me, password recovery, password policy, App Check

**Date:** 2026-06-07
**Branch:** `feat/auth-hardening` (off `feat/login-redesign`)
**App:** `apps/backstage` (+ docs)
**Status:** design approved, pending spec review

Follow-on to the `/login` redesign (FX5). Adds the auth flows the redesign left as
visual-only, plus a real password policy and the App Check ops checklist.

## Goals

1. **Remember me** — checkbox controls Firebase auth persistence.
2. **Password recovery** — custom branded request + reset flow.
3. **reCAPTCHA (App Check v3)** — already coded; ship the ops checklist to turn it on.
4. **Copy fix** — login footnote points to the CEL at `jci.orienteolm@gmail.com`.
5. **Password policy** — min 6, must mix lower + upper + digit; enforced on login
   **and** reset (per product decision).
6. **Brand differentiation + motion** — reset/forgot brand panel is **blue** (vs
   login's black); auth routes get a reduced-motion-safe entrance transition.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| reCAPTCHA kind | App Check v3 (invisible, app-wide). Already wired in `@luminova/firebase`. |
| Password complexity scope | Login **and** reset (user override of the usual "reset-only" guidance). |
| Reset flow | Custom branded `/reset` route (we own the new-password screen). |
| Remember-me default | Checked → `browserLocalPersistence`; unchecked → `browserSessionPersistence`. |
| Brand panel | Login = black (`bg-jci-black`); forgot/reset = blue (`bg-jci-blue`). |

## Non-goals (flagged, not built)

Email verification, MFA, a visible captcha widget, account self-registration,
server-side rules changes. Firebase handles brute-force via `auth/too-many-requests`.

---

## Architecture

All work is `apps/backstage` client code + docs. **Zero** changes to `@luminova/ui`,
`@luminova/types`, `firestore.rules`, or `apps/beacon`. `BrandSide` and the
requirements checklist are backstage-local components.

### Components & units

**`lib/auth/` (Firebase access, framework-free, one function per file):**

- `sign-in.ts` (modify) — `signIn(email, password, remember: boolean)`:
  `await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)`
  then `signInWithEmailAndPassword`. Persistence set on the same `auth` singleton the
  `authStore` observes — no store change needed.
- `request-password-reset.ts` (new) — `requestPasswordReset(email)`:
  `sendPasswordResetEmail(auth, email)`. Throws map through `authErrorMessage`, but
  the **caller swallows errors into the generic success** (see enumeration below).
- `confirm-password-reset.ts` (new) — two functions:
  - `verifyResetCode(oobCode): Promise<string>` → `verifyPasswordResetCode` (returns
    the email the code is for; used to greet the user / validate the link).
  - `confirmReset(oobCode, newPassword): Promise<void>` → `confirmPasswordReset`.

**`features/auth/types/`:**

- `password-policy.ts` (new) — single source of truth for the rule:
  ```ts
  export const PASSWORD_RULES = [
    { id: "len",   test: (v) => v.length >= 6,   label: "Al menos 6 caracteres" },
    { id: "lower", test: (v) => /[a-z]/.test(v), label: "Una minúscula" },
    { id: "upper", test: (v) => /[A-Z]/.test(v), label: "Una mayúscula" },
    { id: "digit", test: (v) => /[0-9]/.test(v), label: "Un número" },
  ] as const;
  export const passwordSchema = z.string().superRefine((v, ctx) => {
    for (const r of PASSWORD_RULES)
      if (!r.test(v)) ctx.addIssue({ code: "custom", message: `La contraseña necesita: ${r.label.toLowerCase()}.` });
  });
  ```
  `PASSWORD_RULES` also feeds the live checklist UI.
- `login-schema.ts` (modify) — `password` uses `passwordSchema` (was `min(1)`).
- `reset-schema.ts` (new) — `{ password: passwordSchema, confirmPassword: z.string() }`
  with `.refine(p => p.password === p.confirmPassword, "Las contraseñas no coinciden.")`.

**`features/auth/components/`:**

- `brand-side.tsx` (modify) — add `tone?: "dark" | "blue"` (default `"dark"`).
  - `dark`: current black panel + jci-blue/teal glow + `LogoLockup inverted` + `jci-blue-75` eyebrow.
  - `blue`: `bg-jci-blue`, white/teal accents, `LogoLockup` `on-blue`, retuned glow
    (lighter, white-ish), pips white. Copy may differ per page (see routes).
  - Accept optional `eyebrow` / `title` / `lead` / `meta` props so each auth page sets
    its own copy while sharing the layout + ripple + motion.
- `password-checklist.tsx` (new) — given the current password value, renders
  `PASSWORD_RULES` with ✓/✗ state (token colors: `ok` / `ink-3`). Used on reset.
- `login-form.tsx` (modify) — pass `remember` to `signIn`; "¿La olvidaste?" becomes
  `<Link to="/forgot-password">`; footnote → "Escríbele al CEL"
  `mailto:jci.orienteolm@gmail.com`.
- `forgot-password-form.tsx` (new) — email `Field`/`Input` → `requestPasswordReset`.
  **Always** transitions to a generic success panel; errors (except validation) are
  swallowed. Back-to-login `<Link>`.
- `reset-password-form.tsx` (new) — reads `oobCode` (prop from route). State machine:
  `verifying → valid | invalid`. `valid`: new-password + confirm fields +
  `<PasswordChecklist>` → `confirmReset` → `done` (link to `/login`). `invalid`/expired:
  error + link to `/forgot-password`.

**`lib/auth/auth-errors.ts` (modify)** — add Spanish messages for
`auth/expired-action-code`, `auth/invalid-action-code`, `auth/weak-password`,
`auth/missing-email`.

**Routes (`src/routes/`, file-based, under the `_auth` layout):**

- `_auth.tsx` (modify) — **move `BrandSide` out of the layout into each route** so
  login is black and forgot/reset are blue with their own copy. The layout keeps only
  the responsive split grid + the entrance-animation wrapper, and renders the
  `BrandSide` slot + form slot from the child route. Login route renders
  `<BrandSide tone="dark">` + `<LoginForm>`; forgot/reset render `tone="blue"` + their
  form. (Mechanism: a tiny `AuthScreen` layout component that takes `brand` + `form`
  props, used by each route — keeps the grid/motion in one place.)
- `_auth.forgot-password.tsx` (new) — `validateSearch` passthrough; renders blue
  `BrandSide` + `ForgotPasswordForm`.
- `_auth.reset.tsx` (new) — `validateSearch` extracts `mode` + `oobCode`
  (`mode` must be `resetPassword`, else treat as invalid). Renders blue `BrandSide` +
  `<ResetPasswordForm oobCode={...}>`.

### Entrance transition

A reduced-motion-safe mount animation, reusing the handoff's own motion vocabulary
(no new deps, no animation lib):

- Add `fade-up` + `ring-build` keyframes to backstage's app CSS (or reuse
  `@luminova/ui` `Reveal` if it fits) with `ease-expo`; gate behind
  `motion-reduce:animate-none` and `@media (prefers-reduced-motion)`.
- The form column content and brand copy animate in on route mount; the ripple does a
  one-shot `ring-build` scale-in. Navigating login → forgot → reset re-triggers the
  entrance, giving the "transition to /reset" feel. The brand panel's black→blue
  difference reads as a deliberate change between the two surfaces.
- Keep it subtle (translateY ~12px, ~600ms) — matches the login redesign's intent.

---

## Data flow

**Sign-in:** form → `signIn(email, pw, remember)` → `setPersistence` → Firebase →
`authStore` (`onAuthStateChanged`) → route guard redirects to `/`.

**Forgot:** form → `requestPasswordReset(email)` → Firebase emails the reset link
(action URL = our `/reset`, configured in console) → UI shows generic success.

**Reset:** user clicks email link → `/reset?mode=resetPassword&oobCode=…` →
`verifyResetCode(oobCode)` → form → `confirmReset(oobCode, newPassword)` → success →
`/login`.

## Error handling

- **Enumeration:** forgot-password shows the same success copy whether or not the
  email exists; only client-side validation (bad email format) blocks submit.
- **Invalid/expired oobCode:** `/reset` shows a friendly error + a link to request a
  new email. `auth/expired-action-code` / `auth/invalid-action-code` mapped.
- **Weak password server-side:** `auth/weak-password` mapped (belt-and-suspenders;
  client already enforces the policy).
- Existing login error mapping unchanged.

## Testing

- `password-policy.test.ts` — each rule pass/fail; combined valid case.
- `sign-in` — `remember=true` → `setPersistence(browserLocalPersistence)`;
  `false` → session. (mock `firebase/auth`.)
- `login-form.test.tsx` — passes `remember` to `signIn`; rejects a non-compliant
  password with the policy message; forgot link points to `/forgot-password`.
- `forgot-password-form.test.tsx` — calls `requestPasswordReset`; shows generic
  success **even when the call rejects** (enumeration); blocks an invalid email.
- `reset-password-form.test.tsx` — verifying → valid renders fields; mismatch error;
  `confirmReset` success state; invalid-code error state.
- `/security-review` on the diff before PR (auth surface).

## Ops checklist (no code — `docs/firebase-setup.md`)

1. Create a **reCAPTCHA v3** site key; register it in **App Check**.
2. Set `VITE_APPCHECK_SITE_KEY` (prod) + per-dev `VITE_APPCHECK_DEBUG_TOKEN`.
3. **Authentication → Templates → Password reset → customize action URL** →
   `https://<backstage-host>/reset` (so the email link hits our branded page).
4. Localize the password-reset email template to Spanish.
5. (Later, roadmap **G4**) flip App Check **enforcement** on for Auth/Firestore once
   keys are verified in prod.
6. Verify the seeded admin password satisfies the new policy (min 6 + mixed) or it
   can no longer sign in.

## Files

New: `features/auth/components/auth-screen.tsx` (grid + motion wrapper),
`lib/auth/request-password-reset.ts`, `lib/auth/confirm-password-reset.ts`,
`features/auth/types/password-policy.ts`, `features/auth/types/reset-schema.ts`,
`features/auth/components/password-checklist.tsx`,
`features/auth/components/forgot-password-form.tsx`,
`features/auth/components/reset-password-form.tsx`,
`routes/_auth.forgot-password.tsx`, `routes/_auth.reset.tsx`, + tests.

Modified: `lib/auth/sign-in.ts`, `lib/auth/auth-errors.ts`,
`features/auth/types/login-schema.ts`, `features/auth/components/login-form.tsx`,
`features/auth/components/brand-side.tsx`, `routes/_auth.tsx`,
`routes/_auth.login.tsx`, `docs/firebase-setup.md`, `docs/roadmap.md` (G4 note +
auth-hardening row).

## Risks

- **Custom `/reset` depends on the console action URL.** Until step 3 is done, reset
  emails hit Firebase's default page. Documented; flagged at PR time.
- **Login complexity can lock out** accounts with legacy weak passwords. Mitigated by
  step 6; acceptable on a pre-launch platform where the directiva creates accounts.
