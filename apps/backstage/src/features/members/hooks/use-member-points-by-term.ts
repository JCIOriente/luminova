import { useQuery } from "@tanstack/react-query";
import { MemberPointsRepository } from "../repositories/member-points-repository";

export function useMemberPointsByTerm(termId: string) {
  return useQuery({
    queryKey: ["memberPoints", "term", termId],
    queryFn: () => new MemberPointsRepository().getAllByTerm(termId),
  });
}
