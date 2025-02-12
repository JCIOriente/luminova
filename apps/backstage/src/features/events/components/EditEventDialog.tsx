import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  toast,
} from '@luminova/ui';
import { useState } from 'react';
import { useUpdateEvent } from '../hooks/useUpdateEvent';
import type { Event, EventInput } from '../types/event';
import { EventForm } from './EventForm';

type Props = {
  event: Event; // The event to be edited
};

export function EditEventDialog({ event }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const updateEventMutation = useUpdateEvent();

  const handleSubmit = (values: EventInput) => {
    updateEventMutation.mutate(
      { id: event.id, ...values },
      {
        onSuccess: () => {
          toast({
            title: 'Success',
            description: 'Event updated successfully',
          });
          setIsOpen(false); // Close the dialog after successful submission
        },
        onError: () => {
          toast({
            title: 'Error',
            description: 'Failed to update event',
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Event</DialogTitle>
        </DialogHeader>
        <EventForm
          onSubmit={handleSubmit}
          isLoading={updateEventMutation.isPending}
          initialValues={event}
        />
      </DialogContent>
    </Dialog>
  );
}
