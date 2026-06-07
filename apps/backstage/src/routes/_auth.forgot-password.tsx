import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "../features/auth/components/auth-screen";
import { BrandSide } from "../features/auth/components/brand-side";
import { ForgotPasswordForm } from "../features/auth/components/forgot-password-form";

export const Route = createFileRoute("/_auth/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return (
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
  );
}
