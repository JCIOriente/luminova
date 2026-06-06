import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MemberRepository } from "../repositories/member-repository";
import type { MemberInput } from "@luminova/types";
import { memberKeys } from "./member-keys";

export function useAddMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MemberInput) => new MemberRepository().create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
