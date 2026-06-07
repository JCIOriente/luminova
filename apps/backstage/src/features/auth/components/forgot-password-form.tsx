import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Button, Field, Icon, Input } from "@luminova/ui";
import { requestPasswordReset } from "../../../lib/auth/request-password-reset";

const schema = z.object({ email: z.string().email("Ingresa un correo válido.") });
type FormInput = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await requestPasswordReset(email);
    } catch {
      // Swallow — never reveal whether an account exists for this email.
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
