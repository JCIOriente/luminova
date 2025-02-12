import { useQuery } from '@tanstack/react-query';
import { EventRepository } from '../repositories/eventRepository';

export const useEvents = () => {
  return useQuery({
    queryKey: ['events'],
    queryFn: () => EventRepository.getEvents(),
  });
};
