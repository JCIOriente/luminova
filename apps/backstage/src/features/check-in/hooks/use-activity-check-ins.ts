import { useQuery } from "@tanstack/react-query";
import { CheckInRepository } from "../repositories/check-in-repository";
import { checkInKeys } from "./check-in-keys";

export function useActivityCheckIns(activityId: string | null) {
  return useQuery({
    queryKey: checkInKeys.byActivity(activityId ?? "none"),
    queryFn: () => new CheckInRepository().getByActivity(activityId as string),
    enabled: !!activityId,
    // Live roster: opt out of the global 5-min staleTime / focus-off policy so two
    // operators scanning the same event from different devices converge on refocus.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
