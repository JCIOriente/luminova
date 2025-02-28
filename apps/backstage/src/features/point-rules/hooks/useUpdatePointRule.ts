import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PointRuleRepository } from '../repositories/pointRuleRepository';
import { PointRule } from '../types/pointRule';

export const useUpdatePointRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updatedData }: PointRule) =>
      PointRuleRepository.updatePointRule(id, updatedData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pointRules'] });
    },
  });
};
