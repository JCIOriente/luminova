import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteAllyLogo } from "@luminova/firebase";
import { AllyRepository } from "../repositories/ally-repository";
import { allyKeys } from "./ally-keys";

export function useRemoveAllyLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Independent writes to two services (Storage blob + Firestore field) — run concurrently.
      await Promise.all([deleteAllyLogo(id), new AllyRepository().clearLogo(id)]);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: allyKeys.all }),
  });
}
