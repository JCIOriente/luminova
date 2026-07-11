import { useQuery } from "@tanstack/react-query";
import { LeadRepository } from "../repositories/lead-repository";
import { leadKeys } from "./lead-keys";

export function useLeads({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: leadKeys.all,
    queryFn: () => new LeadRepository().getAll(),
    enabled,
  });
}
