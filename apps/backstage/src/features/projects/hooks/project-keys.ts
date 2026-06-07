export const projectKeys = {
  all: ["projects"] as const,
  byTerm: (termId: string) => ["projects", "term", termId] as const,
};
