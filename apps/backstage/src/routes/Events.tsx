import { AddEventDialog, EventTable, useEvents } from '../features/events';
import { useMembers } from '../features/members';

export default function Events() {
  const { data: events = [], isLoading, isError, error } = useEvents();
  const { data: membersData, isLoading: isMembersLoading } = useMembers();

  const members = membersData?.members || [];

  if (isError) {
    return (
      <div className="bg-red-50">Error fetching members: {error?.message}</div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Events</h1>
        <AddEventDialog />
      </div>

      <EventTable
        events={events}
        members={members}
        isLoading={isLoading || isMembersLoading}
      />
    </div>
  );
}
