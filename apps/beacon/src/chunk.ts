/**
 * Split an array into batches of at most `size`. Used to bound admin-SDK
 * `getAll(...refs)` fan-out on inputs whose length the rules do not cap
 * (e.g. a member's `roleIds`), mirroring the 300-batch loop in resolveMembers.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
