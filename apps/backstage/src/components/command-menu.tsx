import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CommandPalette, Icon, type CommandItem } from "@luminova/ui";
import { useCan } from "../lib/authz/use-can";
import { NAV_GROUPS } from "./nav-config";
import {
  getCommandMenuOpen,
  setCommandMenuOpen,
  subscribeCommandMenu,
  toggleCommandMenu,
} from "./command-menu-store";

export function CommandMenu() {
  const navigate = useNavigate();
  const gate = useCan();
  const open = useSyncExternalStore(subscribeCommandMenu, getCommandMenuOpen, getCommandMenuOpen);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggleCommandMenu();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const items = useMemo<CommandItem[]>(() => {
    const navItems: CommandItem[] = NAV_GROUPS.flatMap((group) =>
      group.items
        .filter((item) => gate.navItemVisible(item))
        .map((item) => ({
          id: `nav-${item.to}`,
          label: item.label,
          group: "Navegación",
          icon: Icon[item.icon]({ s: 18 }),
          onSelect: () => navigate({ to: item.to }),
        })),
    );

    const actions: CommandItem[] = [];
    actions.push({
      id: "action-me",
      label: "Ir a mi panel",
      group: "Acciones",
      icon: Icon.user({ s: 18 }),
      onSelect: () => navigate({ to: "/me" }),
    });
    if (gate.can("create", "Activity")) {
      actions.push({
        id: "action-create-activity",
        label: "Crear evento",
        group: "Acciones",
        icon: Icon.plus({ s: 18 }),
        onSelect: () => navigate({ to: "/activities" }),
      });
    }
    if (gate.can("create", "Member")) {
      actions.push({
        id: "action-invite-member",
        label: "Invitar miembro",
        group: "Acciones",
        icon: Icon.plus({ s: 18 }),
        onSelect: () => navigate({ to: "/members" }),
      });
    }

    return [...navItems, ...actions];
  }, [gate, navigate]);

  return <CommandPalette open={open} onOpenChange={setCommandMenuOpen} items={items} />;
}
