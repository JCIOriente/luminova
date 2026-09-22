import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { httpsCallable } from "firebase/functions";
import { getFunctionsService } from "@luminova/firebase/functions";
import { ArrowRight, Button, Field, Icon, Input } from "@luminova/ui";
import { setPasswordSchema, type SetPasswordInput } from "../types/set-password-schema";
import { inviteErrorMessage, inviteRefusal } from "../lib/invite-error";
import { PasswordChecklist } from "./password-checklist";

interface InviteDescription {
  email: string;
  name: string;
  expiresAt: number;
}

type Phase =
  | { kind: "loading" }
  // `retryable` is the difference between a network blip and "ya se usó": offering a retry on
  // a deliberate refusal is a dead end, and guardrail #3 asks for a real error state, not a
  // spinner that never resolves.
  | { kind: "error"; heading: string; message: string; retryable: boolean }
  | { kind: "valid"; invite: InviteDescription }
  | { kind: "done" };

const GENERIC_LOAD_ERROR = "No pudimos validar el enlace. Revisa tu conexión e inténtalo de nuevo.";
const GENERIC_REDEEM_ERROR = "No se pudo guardar tu contraseña. Inténtalo de nuevo.";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full max-w-[392px] flex-col">
      <div className="mb-4 font-mono text-ui-2xs uppercase tracking-[0.2em] text-jci-blue">
        Backstage · Crea tu contraseña
      </div>
      {children}
    </div>
  );
}

/** The icon-prefixed password input, twice on this form. Local rather than pushed into
 *  `@luminova/ui`: `login-form.tsx` has a third copy of the same treatment, so the shared
 *  component is worth doing — but as its own change with all three call sites migrated
 *  together, not smuggled in here. */
function PasswordField({
  id,
  label,
  error,
  register,
}: {
  id: "password" | "confirmPassword";
  label: string;
  error?: string;
  register: UseFormRegisterReturn;
}) {
  return (
    <Field label={label} htmlFor={id} error={error}>
      <div className="group relative flex items-center">
        <span className="pointer-events-none absolute left-3.5 flex text-ink-3 transition-colors group-focus-within:text-jci-blue">
          {Icon.lock({ s: 19 })}
        </span>
        <Input
          id={id}
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          className="pl-11"
          aria-invalid={error ? true : undefined}
          {...register}
        />
      </div>
    </Field>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-[31px] font-normal leading-[1.1] -tracking-[0.025em] text-ink-1">
      {children}
    </h1>
  );
}

export function InviteRedeemForm({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [formError, setFormError] = useState<string | null>(null);
  /** Seconds left before a withheld retry becomes available again. Driven off the refusal's
   *  own `retryAfterSeconds` rather than a constant here, so the wait and the server's
   *  refill interval cannot drift apart. */
  const [cooldown, setCooldown] = useState(0);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  /** ONE cancellation token, held in a ref so the effect AND the retry button genuinely share
   *  it. A retry that passed its own always-alive token would be exactly as unguarded as the
   *  code this replaced — which is the bug the guard exists to prevent.
   *
   *  Without it a resolved-but-stale `describeInvite` overwrites a newer phase: the page would
   *  render invite A's name and address while `onSubmit` still closes over token B.
   *  StrictMode's double-invoke in dev makes that reachable on every mount. */
  const runId = useRef(0);

  /** Redemption is TERMINAL. Set before `replaceState`, because that call is not the inert
   *  address-bar tidy it looks like: @tanstack/history monkey-patches
   *  `window.history.replaceState` and calls `onPushPop("REPLACE")`, so the router's location
   *  updates, `invitacion.tsx`'s `useLocation({ select: l => l.hash })` re-renders this
   *  component with `token=""`, `load`'s identity changes, and the effect below re-fires —
   *  overwriting the success screen with "este enlace está incompleto" for someone whose
   *  password was just created successfully. On the only onboarding path there is.
   *
   *  A ref, not a phase check in the deps: the effect must stay reactive to a genuine hash
   *  change (someone pasting a different link) right up until the moment one is redeemed. */
  const settled = useRef(false);

  const load = useCallback(async () => {
    const mine = runId.current + 1;
    runId.current = mine;
    const alive = () => runId.current === mine;
    setPhase({ kind: "loading" });
    // An empty fragment — a truncated paste, or someone typing the path. Refuse locally
    // rather than spending an unauthenticated call to be told the same thing.
    if (token.length === 0) {
      setPhase({
        kind: "error",
        heading: "Enlace incompleto",
        message: "Este enlace está incompleto. Pídele a quien te invitó que te envíe uno nuevo.",
        retryable: false,
      });
      return;
    }
    try {
      const fn = httpsCallable<{ token: string }, InviteDescription>(
        getFunctionsService(),
        "describeInvite",
      );
      const invite = (await fn({ token })).data;
      if (!alive()) return;
      setPhase({ kind: "valid", invite });
    } catch (err) {
      if (!alive()) return;
      const refusal = inviteRefusal(err);
      setPhase({
        kind: "error",
        // The heading comes from the refusal too. Hardcoding "Enlace no válido" here put that
        // headline above the rate-limit copy, which says the link IS still valid.
        heading: refusal.heading,
        message: refusal.message ?? GENERIC_LOAD_ERROR,
        // An untagged failure is a network blip. Among TAGGED refusals only rate limiting is
        // temporary — see RETRYABLE_REASONS. It used to be `refusal === null`, which would
        // hide the retry button from someone whose only problem is having reloaded twice.
        retryable: refusal.retryable,
      });
      setCooldown(refusal.retryAfterSeconds);
    }
  }, [token]);

  // Ticks the withheld-retry countdown down to zero and then stops. Self-terminating (the
  // effect re-runs only while cooldown > 0) and cancelled on unmount, so it cannot outlive the
  // page or leave a timer running behind the success screen.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (settled.current) return;
    void load();
    return () => {
      // Invalidate whatever is in flight: any later response fails its `alive()` check.
      runId.current += 1;
    };
  }, [load]);

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      const fn = httpsCallable<{ token: string; password: string }, { ok: true }>(
        getFunctionsService(),
        "redeemInvite",
      );
      await fn({ token, password });
      // BEFORE replaceState: the router observes that call and drives `token` to "".
      settled.current = true;
      // Drop the burnt token from the address bar AND the history entry — a spent credential
      // must not linger on what may be a shared device.
      window.history.replaceState(null, "", window.location.pathname);
      setPhase({ kind: "done" });
    } catch (err) {
      // The form stays usable: several refusals (a weak password) are correctable in place,
      // and the ones that are not say so in their own copy.
      setFormError(inviteErrorMessage(err, GENERIC_REDEEM_ERROR));
    }
  });

  if (phase.kind === "loading") {
    return (
      <Shell>
        <p className="text-ui-md text-ink-3">Validando el enlace…</p>
      </Shell>
    );
  }

  if (phase.kind === "error") {
    return (
      <Shell>
        <Heading>{phase.heading}</Heading>
        <p role="alert" className="mt-2.5 text-ui-md leading-[1.5] text-ink-3">
          {phase.message}
        </p>
        {phase.retryable && (
          <Button
            as="button"
            type="button"
            // Withheld for the per-token emission interval on a throttled refusal. Retrying
            // immediately spends an endpoint-wide slot to fail, and teaches the invitee the
            // button does not work — while the copy right above promises "unos segundos".
            disabled={cooldown > 0}
            onClick={() => void load()}
            className="mt-8"
          >
            {cooldown > 0 ? `Reintentar en ${cooldown}s` : "Reintentar"}
          </Button>
        )}
      </Shell>
    );
  }

  if (phase.kind === "done") {
    return (
      <Shell>
        <Heading>Contraseña creada</Heading>
        <p className="mt-2.5 text-ui-md leading-[1.5] text-ink-3">
          Ya puedes iniciar sesión con tu correo y tu nueva contraseña.
        </p>
        <Link
          to="/login"
          className="mt-8 text-ui-sm font-semibold text-jci-blue hover:text-jci-blue-2"
        >
          Ir a iniciar sesión →
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <Heading>
        Crea tu contraseña, <b className="font-semibold">{phase.invite.name}</b>
      </Heading>
      {/* The FULL address, unmasked: the token holder is the intended recipient, and this is
          how they confirm the operator sent the right link. Masking protects nobody who could
          simply redeem it. */}
      <p className="mt-2.5 text-ui-md leading-[1.5] text-ink-3">
        Tu cuenta es <span className="font-semibold text-ink-2">{phase.invite.email}</span>.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-[18px]">
        <PasswordField
          id="password"
          label="Nueva contraseña"
          error={errors.password?.message}
          register={register("password")}
        />
        <PasswordChecklist value={watch("password")} />
        <PasswordField
          id="confirmPassword"
          label="Confirmar contraseña"
          error={errors.confirmPassword?.message}
          register={register("confirmPassword")}
        />
        {formError && (
          <div role="alert" className="text-ui-sm text-error">
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
          {isSubmitting ? "Guardando…" : "Crear contraseña"}
        </Button>
      </form>
    </Shell>
  );
}
