// The value reaches a Firestore doc path, and it arrives from a shareable URL.
const MEMBER_ID = /^[A-Za-z0-9_-]{1,128}$/;

export interface MemberSearch {
  miembro?: string;
}

export function validateMemberSearch(search: Record<string, unknown>): MemberSearch {
  const { miembro } = search;
  // An explicit undefined, not {}: the router merges this over the raw parsed search, so an
  // omitted key would let the unvalidated value through.
  return { miembro: typeof miembro === "string" && MEMBER_ID.test(miembro) ? miembro : undefined };
}
