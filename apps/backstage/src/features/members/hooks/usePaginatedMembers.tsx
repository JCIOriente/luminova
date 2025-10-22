import {
  PaginatedData,
  PaginationParam,
  QueryKey,
  QueryResult,
  UsePaginatedReturnType,
} from '@luminova/types';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { MemberRepository } from '../repositories/memberRepository';
import type { Member } from '../types/member';

export const usePaginatedMembers = (
  pageSize: number,
): UsePaginatedReturnType<Member, QueryDocumentSnapshot> => {
  return useInfiniteQuery<
    QueryResult<Member, QueryDocumentSnapshot>,
    Error,
    PaginatedData<Member, QueryDocumentSnapshot>,
    QueryKey,
    PaginationParam<QueryDocumentSnapshot>
  >({
    queryKey: ['members', 'paginated', pageSize],
    queryFn: ({ pageParam = null }) =>
      MemberRepository.getMembers(pageSize, pageParam),
    getNextPageParam: (lastPage) => lastPage.lastDoc || undefined,
    initialPageParam: null,
  });
};
