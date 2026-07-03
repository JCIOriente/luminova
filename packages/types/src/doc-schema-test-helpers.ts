export const fakeTimestamp = { toMillis: () => 0, toDate: () => new Date(0) };

export function without<T extends object>(obj: T, key: keyof T): Partial<T> {
  const rest: Partial<T> = { ...obj };
  delete rest[key];
  return rest;
}
