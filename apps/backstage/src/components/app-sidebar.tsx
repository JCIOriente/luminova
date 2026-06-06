import { Link, useNavigate } from "@tanstack/react-router";
import { Icon, LogoLockup } from "@luminova/ui";
import { useAuth } from "../lib/auth/auth";
import { signOutUser } from "../lib/auth/sign-out";
import { initials } from "../lib/initials";
import { NAV_GROUPS } from "./nav-config";

export function AppSidebar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const label = user?.email ?? "—";

  const onLogout = async () => {
    await signOutUser();
    await navigate({ to: "/login" });
  };

  return (
    <aside className="flex h-dvh w-[264px] flex-col border-r border-line bg-surface">
      <div className="flex h-16 shrink-0 items-center border-b border-line px-[18px]">
        <LogoLockup size="sm" />
      </div>

      <nav className="scroll flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="contents">
            <div className="px-3 pt-4 pb-2 font-mono text-[10px] tracking-[0.16em] text-ink-3 uppercase">
              {group.label}
            </div>
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact ?? false }}
                className="group relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-medium text-ink-2 transition-colors hover:bg-ink-1/[0.04] hover:text-ink-1 [&.active]:bg-jci-blue/10 [&.active]:font-semibold [&.active]:text-jci-blue"
              >
                <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-jci-blue opacity-0 transition-opacity group-[.active]:opacity-100" />
                <span className="flex size-[22px] shrink-0 items-center justify-center">
                  {Icon[item.icon]({ s: 21 })}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-[11px] p-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-jci-navy text-[13px] font-semibold text-white">
            {initials(label)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-ink-1">{label}</div>
            <button
              type="button"
              onClick={onLogout}
              className="text-[11.5px] text-ink-3 transition-colors hover:text-error"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
