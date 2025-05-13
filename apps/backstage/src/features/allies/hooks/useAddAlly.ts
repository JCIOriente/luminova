import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AllyRepository } from '../repositories/allyRepository';
import type { AllyInput } from '../types/ally';

export const useAddAlly = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (allyInput: AllyInput) => AllyRepository.addAlly(allyInput),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allies'] });
    },
  });
};