import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AllyRepository } from "../repositories/ally-repository";
import type { AllyInput } from "../types/ally-schema";
import { allyKeys } from "./ally-keys";

export function useUpdateAlly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AllyInput }) =>
      new AllyRepository().update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: allyKeys.all }),
  });
}
