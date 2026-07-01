import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ParticipationRole } from "@luminova/types/engine";
import { CheckInRepository } from "../repositories/check-in-repository";
import { checkInKeys } from "./check-in-keys";

interface RemoveCheckInInput {
  memberId: string;
  role: ParticipationRole;
}

export function useRemoveCheckIn(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }: RemoveCheckInInput) =>
      new CheckInRepository().remove(activityId, memberId, role),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: checkInKeys.byActivity(activityId) }),
  });
}
