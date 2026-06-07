export const programKeys = {
  all: ["programs"] as const,
  byTerm: (termId: string) => ["programs", "term", termId] as const,
};
