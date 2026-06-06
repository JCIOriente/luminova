export const checkInKeys = {
  byActivity: (activityId: string) => ["checkIns", activityId] as const,
};
