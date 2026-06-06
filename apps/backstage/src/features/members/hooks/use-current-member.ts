import { useQuery } from "@tanstack/react-query";
import { MemberRepository } from "../repositories/member-repository";
import { useAuth } from "../../../lib/auth/auth";
import { memberKeys } from "./member-keys";

export function useCurrentMember() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  return useQuery({
    queryKey: memberKeys.byUid(uid ?? "none"),
    queryFn: () => new MemberRepository().getByUid(uid as string),
    enabled: !!uid,
  });
}
