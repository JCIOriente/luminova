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
import { useAddEvent } from '../hooks/useAddEvent';
import type { EventInput } from '../types/event';
import { EventForm } from './EventForm';

export function AddEventDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const addEventMutation = useAddEvent();

  const handleSubmit = (values: EventInput) => {
    addEventMutation.mutate(values, {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Event added successfully',
        });
        setIsOpen(false); // Close the dialog after successful submission
      },
      onError: () => {
        toast({
          title: 'Error',
          description: 'Failed to add event',
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Add Event</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Event</DialogTitle>
        </DialogHeader>
        <EventForm
          onSubmit={handleSubmit}
          isLoading={addEventMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
