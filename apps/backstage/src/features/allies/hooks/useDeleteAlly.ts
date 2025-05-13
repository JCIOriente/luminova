import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AllyRepository } from '../repositories/allyRepository';

export const useDeleteAlly = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => AllyRepository.deleteAlly(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allies'] });
    },
  });
};