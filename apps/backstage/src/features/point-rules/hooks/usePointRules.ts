import { useQuery } from '@tanstack/react-query';
import { PointRuleRepository } from '../repositories/pointRuleRepository';

export const usePointRules = () => {
  return useQuery({
    queryKey: ['pointRules'],
    queryFn: () => PointRuleRepository.getPointRules(),
  });
};
