import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ActivityInput } from "@luminova/types";
import { ActivityRepository } from "../repositories/activity-repository";
import { activityKeys } from "./activity-keys";

export function useUpdateActivity(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ActivityInput }) =>
      new ActivityRepository().update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: activityKeys.byTerm(termId) }),
  });
}
