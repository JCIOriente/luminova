import { Icon } from "@luminova/ui";

type IconKey = keyof typeof Icon;

export interface NavItem {
  to: "/" | "/members" | "/allies";
  label: string;
  icon: IconKey;
  exact?: boolean;
  subject?: "Member" | "Ally";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { label: "Panel", items: [{ to: "/", label: "Inicio", icon: "home", exact: true }] },
  {
    label: "Gestión",
    items: [
      { to: "/members", label: "Miembros", icon: "user", subject: "Member" },
      { to: "/allies", label: "Aliados", icon: "handshake", subject: "Ally" },
    ],
  },
];

export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_GROUPS.flatMap((g) => g.items).find((i) =>
    i.exact ? pathname === i.to : pathname.startsWith(i.to),
  );
}
