import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@luminova/ui';
import { Trash } from 'lucide-react';
import { useDeleteEvent } from '../hooks/useDeleteEvent';
import type { Event } from '../types/event';
import { EditEventDialog } from './EditEventDialog';

type Props = {
  events: Event[];
};

export function EventTable({ events }: Props) {
  const deleteEventMutation = useDeleteEvent();

  const handleDelete = (id: string) => {
    deleteEventMutation.mutate(id, {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Event deleted successfully',
        });
      },
      onError: () => {
        toast({
          title: 'Error',
          description: 'Failed to delete event',
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <Table className="border">
      <TableHeader className="bg-gray-100">
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Director</TableHead>
          <TableHead>Scope</TableHead>
          <TableHead>Start Date</TableHead>
          <TableHead>End Date</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id} className="hover:bg-gray-50">
            <TableCell>{event.name}</TableCell>
            <TableCell>{event.type}</TableCell>
            <TableCell>{event.directorId}</TableCell>
            <TableCell>{event.scope || 'N/A'}</TableCell>
            <TableCell>{event.startDate}</TableCell>
            <TableCell>{event.endDate}</TableCell>
            <TableCell className="flex items-center gap-2">
              {/* Edit Event Dialog */}
              <EditEventDialog event={event} />
              {/* Delete Event Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(event.id)}
              >
                <Trash className="h-4 w-4 text-red-500" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
