import { Button, Spinner } from '@luminova/ui';
import { AddMemberDialog, MemberTable } from '../features/members';
import { usePaginatedMembers } from '../features/members/hooks/usePaginatedMembers';

export default function Members() {
  const pageSize = 10;

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePaginatedMembers(pageSize);

  // Flatten the paginated data into a single array
  const members = data?.pages.flatMap((page) => page.members) || [];

  // Handle loading more members
  const handleLoadMore = () => {
    if (hasNextPage) {
      fetchNextPage(); // Fetch the next page of data
    }
  };

  if (isError) {
    return (
      <div className="bg-red-50">Error fetching members: {error?.message}</div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Members</h1>
        <AddMemberDialog />
      </div>
      <MemberTable members={members} isLoading={isLoading} />
      {hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            onClick={handleLoadMore}
            disabled={isFetchingNextPage}
            variant="outline"
          >
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
