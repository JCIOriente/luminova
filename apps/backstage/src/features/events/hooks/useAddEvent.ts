import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EventRepository } from '../repositories/eventRepository';
import { EventInput } from '../types/event';

export const useAddEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (event: EventInput) => EventRepository.addEvent(event),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
};
