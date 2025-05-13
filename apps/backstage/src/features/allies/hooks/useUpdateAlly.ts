import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AllyRepository } from '../repositories/allyRepository';
import type { Ally } from '../types/ally';

export const useUpdateAlly = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updatedData }: Ally) => // Accepts full Ally object
      AllyRepository.updateAlly(id, updatedData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allies'] });
    },
  });
};