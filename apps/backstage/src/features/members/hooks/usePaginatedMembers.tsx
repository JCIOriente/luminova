import {
  PaginatedData,
  PaginationParam,
  QueryKey,
  QueryResult,
  UsePaginatedReturnType,
} from '@luminova/types';
import { useInfiniteQuery } from '@tanstack/react-query';
import { DocumentData } from 'firebase/firestore';
import { MemberRepository } from '../repositories/memberRepository';
import type { Member } from '../types/member';

export const usePaginatedMembers = (
  pageSize: number,
): UsePaginatedReturnType<Member, DocumentData> => {
  return useInfiniteQuery<
    QueryResult<Member, DocumentData>,
    Error,
    PaginatedData<Member, DocumentData>,
    QueryKey,
    PaginationParam<DocumentData>
  >({
    queryKey: ['members'],
    queryFn: ({ pageParam = null }) =>
      MemberRepository.getMembers(pageSize, pageParam),
    getNextPageParam: (lastPage) => lastPage.lastDoc || undefined,
    initialPageParam: null,
  });
};
