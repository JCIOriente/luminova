export const memberKeys = {
  all: ["members"] as const,
  detail: (id: string) => ["members", id] as const,
  byUid: (uid: string) => ["members", "uid", uid] as const,
  points: (id: string, termId: string) => ["memberPoints", id, termId] as const,
  pointsByTerm: (termId: string) => ["memberPoints", "term", termId] as const,
  participations: (id: string, termId: string) => ["participations", id, termId] as const,
};
