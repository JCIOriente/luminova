import { useQuery } from "@tanstack/react-query";
import { ParticipationRepository } from "../repositories/participation-repository";
import { memberKeys } from "./member-keys";

export function useMemberParticipations(memberId: string, termId: string) {
  return useQuery({
    queryKey: memberKeys.participations(memberId, termId),
    queryFn: () => new ParticipationRepository().getByMemberAndTerm(memberId, termId),
  });
}
