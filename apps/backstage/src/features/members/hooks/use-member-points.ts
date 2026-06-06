import { useQuery } from "@tanstack/react-query";
import { MemberPointsRepository } from "../repositories/member-points-repository";
import { memberKeys } from "./member-keys";

export function useMemberPoints(memberId: string, termId: string) {
  return useQuery({
    queryKey: memberKeys.points(memberId, termId),
    queryFn: () => new MemberPointsRepository().getByMemberAndTerm(memberId, termId),
  });
}
