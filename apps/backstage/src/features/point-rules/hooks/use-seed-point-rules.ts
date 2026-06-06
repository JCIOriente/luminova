import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PointRuleRepository } from "../repositories/point-rule-repository";
import { pointRuleKeys } from "./point-rule-keys";

export function useSeedPointRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (termId: string) => new PointRuleRepository().seed(termId),
    onSuccess: (_data, termId) =>
      queryClient.invalidateQueries({ queryKey: pointRuleKeys.byTerm(termId) }),
  });
}
