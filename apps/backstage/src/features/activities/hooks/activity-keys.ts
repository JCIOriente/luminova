export const activityKeys = {
  all: ["activities"] as const,
  byTerm: (termId: string) => ["activities", "term", termId] as const,
  byId: (id: string) => ["activities", "detail", id] as const,
  checkInCount: (id: string) => ["activities", "checkin-count", id] as const,
};
