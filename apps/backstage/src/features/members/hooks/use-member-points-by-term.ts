import { useQuery } from "@tanstack/react-query";
import { MemberPointsRepository } from "../repositories/member-points-repository";
import { memberKeys } from "./member-keys";

export function useMemberPointsByTerm(termId: string) {
  return useQuery({
    queryKey: memberKeys.pointsByTerm(termId),
    queryFn: () => new MemberPointsRepository().getAllByTerm(termId),
  });
}
