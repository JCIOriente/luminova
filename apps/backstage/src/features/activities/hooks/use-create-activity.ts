import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ActivityRepository } from "../repositories/activity-repository";
import type { ActivityInput } from "@luminova/types";
import { activityKeys } from "./activity-keys";

export function useCreateActivity(termId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ActivityInput) => new ActivityRepository().create(data, termId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: activityKeys.byTerm(termId) }),
  });
}
