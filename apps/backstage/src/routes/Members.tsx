import { Button, Spinner } from '@luminova/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { DocumentData } from 'firebase/firestore';
import {
  AddMemberDialog,
  Member,
  MemberRepository,
  MemberTable,
} from '../features/members';

export default function Members() {
  const pageSize = 1;

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<
    { members: Member[]; lastDoc: DocumentData | null }, // Type of query result
    Error, // Error type
    {
      pages: [
        { members: Member[]; lastDoc: DocumentData | null }, // Type of paginated data
      ];
      pageParam: DocumentData | null;
    },
    string[], // Query key type
    DocumentData | null // Pagination parameter type
  >({
    queryKey: ['members'], // Query key for the members list
    queryFn: ({ pageParam = null }) =>
      MemberRepository.getMembers(pageSize, pageParam), // Fetch members based on pageParam (lastDoc)
    getNextPageParam: (lastPage) => lastPage.lastDoc || undefined, // Determine the next page parameter
    initialPageParam: null, // Initial pagination parameter (null for Firestore pagination)
  });

  // Flatten the paginated data into a single array
  const members = data?.pages.flatMap((page) => page.members) || [];

  // Handle loading more members
  const handleLoadMore = () => {
    if (hasNextPage) {
      fetchNextPage(); // Fetch the next page of data
    }
  };

  if (isLoading && members.length === 0) {
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
        <h1 className="text-2xl font-bold">Members</h1>
        <AddMemberDialog />
      </div>
      <MemberTable members={members} />
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
