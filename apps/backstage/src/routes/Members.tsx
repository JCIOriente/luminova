import { Spinner } from '@luminova/ui';
import { useQuery } from '@tanstack/react-query';
import {
  AddMemberDialog,
  MemberRepository,
  MemberTable,
} from '../features/members';

export default function Members() {
  const {
    data: members,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['members'],
    queryFn: () => MemberRepository.getMembers(),
  });

  if (isLoading) {
    return (
      <div className="flex w-full justify-center border border-gray-100 p-5">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isError) {
    return <div className="bg-red-50">Error fetching members</div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Members</h1>
        <AddMemberDialog />
      </div>
      <MemberTable members={members || []} />
    </div>
  );
}
