import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/** Opens a member's profile over the current page. A real link, so it can be opened in a new
 *  tab and shared. */
export function MemberLink({
  memberId,
  name,
  className,
  children,
}: {
  memberId: string;
  name: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to="."
      search={(prev) => ({ ...prev, miembro: memberId })}
      resetScroll={false}
      aria-label={`Ver perfil de ${name}`}
      className={className ? `${className} member-link` : "member-link"}
    >
      {children}
    </Link>
  );
}
