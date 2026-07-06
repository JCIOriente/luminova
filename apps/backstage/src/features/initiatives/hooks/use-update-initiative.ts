import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InitiativeInput } from "@luminova/types";
import { InitiativeRepository } from "../repositories/initiative-repository";
import { INITIATIVE_CONFIG, type InitiativeType } from "../lib/initiative-kind";
import { initiativeKeys, initiativeDetailKey } from "./initiative-keys";

export function useUpdateInitiative(type: InitiativeType, termId: string) {
  const qc = useQueryClient();
  const { collection } = INITIATIVE_CONFIG[type];
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: InitiativeInput }) =>
      new InitiativeRepository(type).update(id, data),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: initiativeKeys(collection).byTerm(termId) });
      void qc.invalidateQueries({ queryKey: initiativeDetailKey(type, id) });
    },
  });
}
