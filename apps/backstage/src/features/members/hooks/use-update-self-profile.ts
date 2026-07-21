import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SelfProfileInput } from "@luminova/types";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

/** A member editing their own profile on /me. `memberKeys.all` is the prefix of the
 *  by-uid key the page reads, so one invalidation refreshes both. */
export function useUpdateSelfProfile(memberId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SelfProfileInput) =>
      new MemberRepository().updateSelfProfile(memberId, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
