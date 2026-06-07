import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Member } from "@luminova/types";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

export function useDeleteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new MemberRepository().softDelete(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: memberKeys.all });
      const previous = queryClient.getQueryData<Member[]>(memberKeys.all);
      queryClient.setQueryData<Member[]>(memberKeys.all, (rows) =>
        rows?.filter((m) => m.id !== id),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(memberKeys.all, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
