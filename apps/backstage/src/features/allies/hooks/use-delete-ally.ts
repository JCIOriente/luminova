import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AllyRepository } from "../repositories/ally-repository";
import { allyKeys } from "./ally-keys";

export function useDeleteAlly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new AllyRepository().softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: allyKeys.all }),
  });
}
