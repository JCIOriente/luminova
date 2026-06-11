import { useQuery } from "@tanstack/react-query";
import type { Activity } from "@luminova/types";
import { ActivityRepository } from "../repositories/activity-repository";
import { activityKeys } from "./activity-keys";

export function useActivity(id: string, opts?: { enabled?: boolean }) {
  return useQuery<Activity | null>({
    queryKey: activityKeys.byId(id),
    queryFn: () => new ActivityRepository().getById(id),
    enabled: opts?.enabled ?? true,
  });
}
