import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteAllyLogo } from "@luminova/firebase";
import { AllyRepository } from "../repositories/ally-repository";
import { allyKeys } from "./ally-keys";

export function useRemoveAllyLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Firestore first: clearing logoUrl re-triggers onAllyWritten, which removes the
      // ally from the public projection BEFORE its blob disappears. Deleting the blob
      // first then failing to clear logoUrl would leave a broken <img> on the public
      // site; an orphaned blob after a clearLogo success is harmless (no public ref).
      await new AllyRepository().clearLogo(id);
      await deleteAllyLogo(id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: allyKeys.all }),
  });
}
