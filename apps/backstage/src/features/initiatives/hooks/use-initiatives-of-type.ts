import { useQuery } from "@tanstack/react-query";
import { InitiativeRepository } from "../repositories/initiative-repository";
import { INITIATIVE_CONFIG, type InitiativeType } from "../lib/initiative-kind";
import { initiativeKeys } from "./initiative-keys";

/**
 * Single-kind list query. For the merged both-kinds list see `useInitiativesByTerm`.
 */
export function useInitiativesOfType(
  type: InitiativeType,
  termId: string,
  options?: { enabled?: boolean },
) {
  const { collection } = INITIATIVE_CONFIG[type];
  return useQuery({
    queryKey: initiativeKeys(collection).byTerm(termId),
    queryFn: () => new InitiativeRepository(type).getByTerm(termId),
    enabled: options?.enabled ?? true,
  });
}
