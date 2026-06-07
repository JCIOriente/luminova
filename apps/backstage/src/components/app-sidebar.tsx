import { useSyncExternalStore } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Icon, IconButton, LogoLockup, Button, SegmentedControl, Tooltip } from "@luminova/ui";
import { hasAnyRole } from "@luminova/auth/roles";
import { useAuth } from "../lib/auth/auth";
import { useAbility } from "../lib/authz/ability-context";
import { signOutUser } from "../lib/auth/sign-out";
import { initials } from "../lib/initials";
import { NAV_GROUPS } from "./nav-config";
import {
  getSidebarCollapsed,
  setSidebarCollapsed,
  getThemePref,
  setThemePref,
  subscribe,
  type ThemePref,
} from "../lib/ui-prefs";

const THEME_OPTIONS: readonly { value: ThemePref; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const { user, claims } = useAuth();
  const ability = useAbility();
  const collapsed = useSyncExternalStore(subscribe, getSidebarCollapsed, getSidebarCollapsed);
  const theme = useSyncExternalStore(subscribe, getThemePref, getThemePref);
  const label = user?.email ?? "—";

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (!item.subject || ability.can(item.action ?? "read", item.subject)) &&
        (!item.roles || hasAnyRole(claims, item.roles)),
    ),
  })).filter((group) => group.items.length > 0);

  const onLogout = async () => {
    await signOutUser();
    await navigate({ to: "/login" });
  };

  return (
    <aside
      className={`flex h-dvh flex-col border-r border-line bg-surface ${collapsed ? "w-[72px]" : "w-[264px]"}`}
    >
      <div
        className={`flex h-16 shrink-0 items-center border-b border-line ${collapsed ? "justify-center px-2" : "justify-between px-[18px]"}`}
      >
        {!collapsed && <LogoLockup size="sm" />}
        <IconButton
          as="button"
          variant="subtle"
          size="sm"
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          onClick={() => setSidebarCollapsed(!collapsed)}
        >
          {Icon.sidebarLeft({ s: 20 })}
        </IconButton>
      </div>

      <nav className="scroll flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {visibleGroups.map((group) => (
          <div key={group.label} className="contents">
            {!collapsed && (
              <div className="px-3 pt-4 pb-2 font-mono text-[10px] tracking-[0.16em] text-ink-3 uppercase">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const link = (
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.exact ?? false }}
                  className={`group relative flex items-center gap-3 rounded-[10px] py-2.5 text-[14px] font-medium text-ink-2 transition-colors hover:bg-ink-1/[0.04] hover:text-ink-1 [&.active]:bg-jci-blue/10 [&.active]:font-semibold [&.active]:text-jci-blue ${collapsed ? "justify-center px-2" : "px-3"}`}
                >
                  <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-jci-blue opacity-0 transition-opacity group-[.active]:opacity-100" />
                  <span className="flex size-[22px] shrink-0 items-center justify-center">
                    {Icon[item.icon]({ s: 21 })}
                  </span>
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                </Link>
              );
              return collapsed ? (
                <Tooltip key={item.to} content={item.label} side="right">
                  {link}
                </Tooltip>
              ) : (
                <div key={item.to} className="contents">
                  {link}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        {!collapsed && (
          <div className="px-2 pb-3">
            <SegmentedControl
              aria-label="Tema"
              options={THEME_OPTIONS}
              value={theme}
              onChange={setThemePref}
            />
          </div>
        )}
        <div
          className={`flex items-center gap-2.5 rounded-[11px] p-2 ${collapsed ? "justify-center" : ""}`}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-jci-navy text-[13px] font-semibold text-white">
            {initials(label)}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-ink-1">{label}</div>
              <Button as="button" variant="link" tone="danger" onClick={onLogout}>
                Cerrar sesión
              </Button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
