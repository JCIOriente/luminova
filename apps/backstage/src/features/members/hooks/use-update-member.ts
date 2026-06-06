import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MemberRepository } from "../repositories/member-repository";
import type { MemberInput } from "@luminova/types";
import { memberKeys } from "./member-keys";

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MemberInput }) =>
      new MemberRepository().update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
