import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "../lib/auth/auth";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-[28px] font-semibold text-ink-1">Panel</h2>
      <p className="text-ink-2">Sesión iniciada como {user?.email ?? "—"}.</p>
    </div>
  );
}
