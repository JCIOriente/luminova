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
