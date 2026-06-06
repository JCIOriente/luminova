import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PointRuleRepository } from "../repositories/point-rule-repository";
import { pointRuleKeys } from "./point-rule-keys";

export function useUpdatePointRule(termId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, points }: { id: string; points: number }) =>
      new PointRuleRepository().updatePoints(id, points),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pointRuleKeys.byTerm(termId) }),
  });
}
