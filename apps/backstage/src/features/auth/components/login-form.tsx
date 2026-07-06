import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Button, Checkbox, Field, Icon, Input, LogoLockup } from "@luminova/ui";
import { loginSchema, type LoginInput } from "../types/login-schema";
import { signIn } from "../../../lib/auth/sign-in";
import { authErrorMessage } from "../../../lib/auth/auth-errors";

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
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
      await signIn(values.email, values.password, remember);
      onSuccess();
    } catch (error) {
      setFormError(authErrorMessage(error));
    }
  });

  return (
    <div className="flex w-full max-w-[392px] flex-col">
      <div className="mb-10 lg:hidden">
        <LogoLockup variant="default" size="sm" />
      </div>

      <div className="mb-4 font-mono text-ui-2xs uppercase tracking-[0.2em] text-jci-blue">
        Backstage · Acceso privado
      </div>
      <h1 className="text-[31px] font-normal leading-[1.1] -tracking-[0.025em] text-ink-1">
        Bienvenida de nuevo
      </h1>
      <p className="mt-2.5 text-ui-md leading-[1.5] text-ink-3">
        Inicia sesión para coordinar a la directiva de JCI Oriente.
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

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-ui-sm font-semibold text-ink-1">
              Contraseña
            </label>
            <Link
              to="/forgot-password"
              className="text-ui-xs font-semibold text-jci-blue transition-colors hover:text-jci-blue-2"
            >
              ¿La olvidaste?
            </Link>
          </div>
          <div className="group relative flex items-center">
            <span className="pointer-events-none absolute left-3.5 flex text-ink-3 transition-colors group-focus-within:text-jci-blue">
              {Icon.lock({ s: 19 })}
            </span>
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              className="pl-11 pr-12"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "password-err" : undefined}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute right-2 flex h-[34px] w-[34px] items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-1"
            >
              {showPassword ? Icon.eyeOff({ s: 19 }) : Icon.eye({ s: 19 })}
            </button>
          </div>
          {errors.password && (
            <div
              id="password-err"
              role="alert"
              className="flex items-center gap-1.5 text-ui-sm text-error"
            >
              {Icon.close({ s: 13 })}
              {errors.password.message}
            </div>
          )}
        </div>

        <Checkbox checked={remember} onChange={setRemember} label="Recordarme" />

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
          {isSubmitting ? "Entrando…" : "Entrar a Backstage"}
        </Button>
      </form>

      <p className="mt-9 text-ui-xs leading-[1.5] text-ink-3">
        ¿Aún no tienes acceso? La cuenta la crea la directiva.{" "}
        <a
          href="mailto:jci.orienteolm@gmail.com"
          className="font-semibold text-jci-blue hover:text-jci-blue-2"
        >
          Escríbele al CEL
        </a>
        .
      </p>
    </div>
  );
}
