import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadStatus } from "@luminova/types";
import { LeadRepository } from "../repositories/lead-repository";
import { leadKeys } from "./lead-keys";

export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      new LeadRepository().updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadKeys.all }),
  });
}
