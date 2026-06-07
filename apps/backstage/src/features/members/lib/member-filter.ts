import type { Member, MemberStatus } from "@luminova/types";
import { MEMBER_STATUSES } from "@luminova/types";

export type StatusFilter = "Todos" | MemberStatus;

export interface MemberFilter {
  search: string;
  status: StatusFilter;
}

export function filterMembers(members: Member[], { search, status }: MemberFilter): Member[] {
  const q = search.trim().toLowerCase();
  return members.filter((m) => {
    if (status !== "Todos" && m.status !== status) return false;
    if (!q) return true;
    return `${m.name} ${m.email} ${m.role}`.toLowerCase().includes(q);
  });
}

export type StatusCounts = Record<"Todos" | MemberStatus, number>;

export function statusCounts(members: Member[]): StatusCounts {
  const counts = { Todos: members.length } as StatusCounts;
  for (const s of MEMBER_STATUSES) counts[s] = 0;
  for (const m of members) counts[m.status] += 1;
  return counts;
}
