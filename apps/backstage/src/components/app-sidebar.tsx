import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@luminova/ui";
import { signOutUser } from "../lib/auth/sign-out";

export function AppSidebar() {
  const navigate = useNavigate();

  const onLogout = async () => {
    await signOutUser();
    await navigate({ to: "/login" });
  };

  return (
    <aside className="flex w-60 flex-col gap-6 border-r border-line bg-surface p-5">
      <div className="text-[13px] font-semibold tracking-wider text-ink-2 uppercase">
        JCI Oriente
      </div>
      <nav className="flex flex-col gap-1">
        <Link
          to="/"
          activeOptions={{ exact: true }}
          className="rounded-[8px] px-3 py-2 text-[15px] text-ink-1 hover:bg-surface-3 [&.active]:bg-surface-3 [&.active]:font-semibold"
        >
          Panel
        </Link>
        <Link
          to="/members"
          className="rounded-[8px] px-3 py-2 text-[15px] text-ink-1 hover:bg-surface-3 [&.active]:bg-surface-3 [&.active]:font-semibold"
        >
          Miembros
        </Link>
        <Link
          to="/allies"
          className="rounded-[8px] px-3 py-2 text-[15px] text-ink-1 hover:bg-surface-3 [&.active]:bg-surface-3 [&.active]:font-semibold"
        >
          Aliados
        </Link>
      </nav>
      <div className="mt-auto">
        <Button as="button" type="button" variant="secondary" size="sm" onClick={onLogout}>
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}
