import type { User } from "firebase/auth";

export interface LoginRedirect {
  to: "/login";
  search: { redirect: string };
}

export function authRedirect(user: User | null, href: string): LoginRedirect | null {
  if (user) return null;
  return { to: "/login", search: { redirect: href } };
}
