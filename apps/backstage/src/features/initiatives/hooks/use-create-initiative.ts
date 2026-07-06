import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InitiativeInput } from "@luminova/types";
import { InitiativeRepository } from "../repositories/initiative-repository";
import { INITIATIVE_CONFIG, type InitiativeType } from "../lib/initiative-kind";
import { initiativeKeys } from "./initiative-keys";

export function useCreateInitiative(type: InitiativeType, termId: string) {
  const qc = useQueryClient();
  const { collection } = INITIATIVE_CONFIG[type];
  return useMutation({
    mutationFn: (data: InitiativeInput) => new InitiativeRepository(type).create(data, termId),
    onSuccess: () => qc.invalidateQueries({ queryKey: initiativeKeys(collection).byTerm(termId) }),
  });
}
