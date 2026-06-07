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
