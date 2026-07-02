import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Member, MemberInput, TermPositions } from "@luminova/types";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

interface UpdateMemberVars {
  id: string;
  data: MemberInput;
  /** The member's current-term assignment (or null), so the mapper can skip
   *  re-stamping an unchanged positions slot — which the rules would otherwise
   *  re-gate, denying a bio-only edit of a power-cargo member. Required so a caller
   *  can't silently drop it. */
  currentPositions: Pick<TermPositions, "cargoId" | "comisionIds"> | null;
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, currentPositions }: UpdateMemberVars) =>
      new MemberRepository().update(id, data, currentPositions),
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
