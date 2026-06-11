import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";
import type { PositionsInput } from "../components/member-positions-form";

export function useSetMemberPositions(memberId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PositionsInput) => new MemberRepository().setPositions(memberId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.all });
      void queryClient.invalidateQueries({ queryKey: memberKeys.detail(memberId) });
    },
  });
}
