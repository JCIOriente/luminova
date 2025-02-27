import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PointRuleRepository } from '../repositories/pointRuleRepository';

export const useDeletePointRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => PointRuleRepository.deletePointRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pointRules'] });
    },
  });
};
