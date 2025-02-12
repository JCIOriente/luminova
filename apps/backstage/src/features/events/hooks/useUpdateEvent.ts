import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EventRepository } from '../repositories/eventRepository';

export const useUpdateEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updatedData }: { id: string; [key: string]: any }) =>
      EventRepository.updateEvent(id, updatedData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
};
