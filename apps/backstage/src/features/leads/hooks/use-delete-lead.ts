import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LeadRepository } from "../repositories/lead-repository";
import { leadKeys } from "./lead-keys";

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new LeadRepository().softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadKeys.all }),
  });
}
