import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Member } from "@luminova/types";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

/** Admin takedown: force a member off the public Directiva. One direction only — the
 *  rules arm accepts `publicProfile: false` and nothing else, so there is no publish
 *  counterpart here. Turning publication back ON stays the member's own decision. */
export function useUnpublishMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new MemberRepository().unpublishProfile(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: memberKeys.all });
      const previous = queryClient.getQueryData<Member[]>(memberKeys.all);
      queryClient.setQueryData<Member[]>(memberKeys.all, (rows) =>
        rows?.map((m) => (m.id === id ? { ...m, publicProfile: false } : m)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(memberKeys.all, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
