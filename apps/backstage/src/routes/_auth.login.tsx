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
