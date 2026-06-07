import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ActivityRepository } from "../repositories/activity-repository";
import { activityKeys } from "./activity-keys";

export function useCancelActivity(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new ActivityRepository().cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: activityKeys.byTerm(termId) }),
  });
}
