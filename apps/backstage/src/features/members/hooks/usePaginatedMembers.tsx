import { useInfiniteQuery } from '@tanstack/react-query';
import { DocumentData } from 'firebase/firestore';
import { MemberRepository } from '../repositories/memberRepository';
import { Member } from '../types/member';

type QueryResult = {
  members: Member[];
  lastDoc: DocumentData | null;
};

type PaginatedData = {
  pages: QueryResult[];
  pageParams: (DocumentData | null)[];
};

type QueryKey = string[];

type PaginationParam = DocumentData | null;

type ErrorType = Error;

type UsePaginatedMembersReturnType = ReturnType<
  typeof useInfiniteQuery<
    QueryResult,
    ErrorType,
    PaginatedData,
    QueryKey,
    PaginationParam
  >
>;

export const usePaginatedMembers = (
  pageSize: number,
): UsePaginatedMembersReturnType => {
  return useInfiniteQuery<
    QueryResult,
    ErrorType,
    PaginatedData,
    QueryKey,
    PaginationParam
  >({
    queryKey: ['members'],
    queryFn: ({ pageParam = null }) =>
      MemberRepository.getMembers(pageSize, pageParam),
    getNextPageParam: (lastPage) => lastPage.lastDoc || undefined,
    initialPageParam: null,
  });
};
