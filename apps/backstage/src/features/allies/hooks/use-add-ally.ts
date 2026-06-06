import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AllyRepository } from "../repositories/ally-repository";
import type { AllyInput } from "@luminova/types";
import { allyKeys } from "./ally-keys";

export function useAddAlly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AllyInput) => new AllyRepository().create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: allyKeys.all }),
  });
}
