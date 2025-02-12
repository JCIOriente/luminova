import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EventRepository } from '../repositories/eventRepository';

export const useDeleteEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => EventRepository.deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
};
