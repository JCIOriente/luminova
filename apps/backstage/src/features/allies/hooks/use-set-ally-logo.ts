import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadAllyLogo } from "@luminova/firebase";
import { AllyRepository } from "../repositories/ally-repository";
import { allyKeys } from "./ally-keys";

export function useSetAllyLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const url = await uploadAllyLogo(id, file);
      await new AllyRepository().setLogo(id, url);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: allyKeys.all }),
  });
}
