import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

export function useDeleteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new MemberRepository().softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
