import { useMutation, useQueryClient } from "@tanstack/react-query";
import { InitiativeRepository } from "../repositories/initiative-repository";
import { INITIATIVE_CONFIG, type InitiativeType } from "../lib/initiative-kind";
import { initiativeKeys, initiativeDetailKey } from "./initiative-keys";

/**
 * List quick-toggle for `featured`. Handles both kinds (the /initiatives list mixes
 * programs + projects), so the kind's `type` travels in the mutation variables
 * rather than being fixed per-hook like the create/update hooks.
 */
export function useToggleFeatured(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, id, featured }: { type: InitiativeType; id: string; featured: boolean }) =>
      new InitiativeRepository(type).setFeatured(id, featured),
    onSuccess: (_data, { type, id }) => {
      const { collection } = INITIATIVE_CONFIG[type];
      void qc.invalidateQueries({ queryKey: initiativeKeys(collection).byTerm(termId) });
      void qc.invalidateQueries({ queryKey: initiativeDetailKey(type, id) });
    },
  });
}
