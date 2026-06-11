import { useQuery } from "@tanstack/react-query";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

export function useMembers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: memberKeys.all,
    queryFn: () => new MemberRepository().getAll(),
    enabled: options?.enabled ?? true,
  });
}
