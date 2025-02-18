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
import { EmptyTableRow } from '../../../components/EmptyTableRow';
import { LoadingTableRow } from '../../../components/LoadingTableRow';
import type { Member } from '../../members';
import { useDeleteEvent } from '../hooks/useDeleteEvent';
import type { Event } from '../types/event';
import { EditEventDialog } from './EditEventDialog';

type Props = {
  events: Event[];
  members?: Member[];
  isLoading: boolean;
};

export function EventTable({ events, members, isLoading }: Props) {
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

  const data = events.map((event) => {
    const director = members?.find((member) => {
      return event.directorId === member.id;
    });
    return { ...event, director };
  });

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
        {isLoading && <LoadingTableRow colSpan={7} />}

        {!isLoading && events.length === 0 && (
          <EmptyTableRow
            colSpan={7}
            text="There are no events to show at this time"
          />
        )}

        {!isLoading &&
          data.length > 0 &&
          data.map((event) => (
            <TableRow key={event.id} className="hover:bg-gray-50">
              <TableCell>{event.name}</TableCell>
              <TableCell>{event.type}</TableCell>
              <TableCell>{event.director?.name || '-'}</TableCell>
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
