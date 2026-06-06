import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckInRepository } from "../repositories/check-in-repository";
import type { CheckInInput } from "@luminova/types";
import { checkInKeys } from "./check-in-keys";

export function useCreateCheckIn(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckInInput) => new CheckInRepository().create(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: checkInKeys.byActivity(activityId) }),
  });
}
