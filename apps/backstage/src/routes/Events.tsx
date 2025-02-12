import { Spinner } from '@luminova/ui';
import { AddEventDialog, EventTable, useEvents } from '../features/events';

export default function Events() {
  const { data: events = [], isLoading, isError, error } = useEvents();

  if (isLoading && events.length === 0) {
    return (
      <div className="flex w-full justify-center border border-gray-100 p-5">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50">Error fetching members: {error?.message}</div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Events Management</h1>
        <AddEventDialog />
      </div>

      <EventTable events={events} />
    </div>
  );
}
