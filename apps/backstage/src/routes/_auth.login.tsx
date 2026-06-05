import { createFileRoute, useRouter } from "@tanstack/react-router";
import { LoginForm } from "../features/auth/components/login-form";

interface LoginSearch {
  redirect?: string;
}

export const Route = createFileRoute("/_auth/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const { redirect } = Route.useSearch();

  return <LoginForm onSuccess={() => router.history.push(redirect ?? "/")} />;
}
