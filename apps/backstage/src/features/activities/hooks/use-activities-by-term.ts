import { useQuery } from "@tanstack/react-query";
import { ActivityRepository } from "../repositories/activity-repository";
import { activityKeys } from "./activity-keys";

export function useActivitiesByTerm(termId: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: activityKeys.byTerm(termId),
    queryFn: () => new ActivityRepository().getByTerm(termId),
    enabled: opts?.enabled ?? true,
  });
}
