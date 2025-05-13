import { useQuery } from '@tanstack/react-query';
import { AllyRepository } from '../repositories/allyRepository';

export const useAllies = () => {
  return useQuery({
    queryKey: ['allies'],
    queryFn: () => AllyRepository.getAllies(),
  });
};