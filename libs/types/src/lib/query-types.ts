export type QueryResult<T, U> = {
  members: T[];
  lastDoc: U | null;
};

export type QueryKey = string[];
