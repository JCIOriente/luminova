import { useQuery } from "@tanstack/react-query";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

export function useMember(id: string) {
  return useQuery({
    queryKey: memberKeys.detail(id),
    queryFn: () => new MemberRepository().getById(id),
  });
}
