import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Member, MemberInput } from "@luminova/types";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MemberInput }) =>
      new MemberRepository().update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: memberKeys.all });
      const previous = queryClient.getQueryData<Member[]>(memberKeys.all);
      queryClient.setQueryData<Member[]>(memberKeys.all, (rows) =>
        rows?.map((m) =>
          m.id === id
            ? {
                ...m,
                name: data.name,
                email: data.email,
                phone: data.phone ?? "",
                gender: data.gender,
                profession: data.profession ?? "",
                status: data.status,
              }
            : m,
        ),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(memberKeys.all, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
