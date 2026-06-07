import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Button, Field, Icon, Input } from "@luminova/ui";
import { resetSchema, type ResetInput } from "../types/reset-schema";
import { confirmReset, verifyResetCode } from "../../../lib/auth/confirm-password-reset";
import { authErrorMessage } from "../../../lib/auth/auth-errors";
import { PasswordChecklist } from "./password-checklist";

type Phase = "verifying" | "valid" | "invalid" | "done";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full max-w-[392px] flex-col">
      <div className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.2em] text-jci-blue">
        Backstage · Nueva contraseña
      </div>
      {children}
    </div>
  );
}

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

  if (phase === "verifying") {
    return (
      <Shell>
        <p className="text-[14.5px] text-ink-3">Validando el enlace…</p>
      </Shell>
    );
  }

  if (phase === "invalid") {
    return (
      <Shell>
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
      </Shell>
    );
  }

  if (phase === "done") {
    return (
      <Shell>
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
      </Shell>
    );
  }

  return (
    <Shell>
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
    </Shell>
  );
}
