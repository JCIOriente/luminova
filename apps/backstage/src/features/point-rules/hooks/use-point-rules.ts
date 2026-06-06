import { useQuery } from "@tanstack/react-query";
import { PointRuleRepository } from "../repositories/point-rule-repository";
import { pointRuleKeys } from "./point-rule-keys";

export function usePointRules(termId: string) {
  return useQuery({
    queryKey: pointRuleKeys.byTerm(termId),
    queryFn: () => new PointRuleRepository().getAllByTerm(termId),
  });
}
