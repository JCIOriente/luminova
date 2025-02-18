import { UseInfiniteQueryResult } from '@tanstack/react-query';
import { QueryResult } from './query-types';

export type PaginationParam<U> = U | null;

export type PaginatedData<T, U> = {
  pages: QueryResult<T, U>[];
  pageParams: (U | null)[];
};

export type UsePaginatedReturnType<T, U> = UseInfiniteQueryResult<
  PaginatedData<T, U>,
  Error
>;
