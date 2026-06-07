import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Member } from "@luminova/types";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

export function useSetMemberStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Member["status"] }) =>
      new MemberRepository().setStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: memberKeys.all });
      const previous = queryClient.getQueryData<Member[]>(memberKeys.all);
      queryClient.setQueryData<Member[]>(memberKeys.all, (rows) =>
        rows?.map((m) => (m.id === id ? { ...m, status } : m)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(memberKeys.all, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
