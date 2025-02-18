import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EventRepository } from '../repositories/eventRepository';
import { Event } from '../types/event';

export const useUpdateEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updatedData }: Event) =>
      EventRepository.updateEvent(id, updatedData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
};
