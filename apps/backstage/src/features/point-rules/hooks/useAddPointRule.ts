import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PointRuleRepository } from '../repositories/pointRuleRepository';
import { PointRuleInput } from '../types/pointRule';

export const useAddPointRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pointsTableInput: PointRuleInput) =>
      PointRuleRepository.addPointRule(pointsTableInput),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pointRules'] });
    },
  });
};
