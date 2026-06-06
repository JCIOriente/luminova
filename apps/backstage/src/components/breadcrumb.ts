import { navItemForPath } from "./nav-config";

export function sectionTitle(pathname: string): string {
  return navItemForPath(pathname)?.label ?? "";
}
