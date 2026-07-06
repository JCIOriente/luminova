import { useQuery } from "@tanstack/react-query";
import { InitiativeRepository } from "../repositories/initiative-repository";
import { INITIATIVE_CONFIG, type InitiativeType } from "../lib/initiative-kind";
import { initiativeDetailKey } from "./initiative-keys";
import type { InitiativeListItem } from "../lib/initiative-list-item";

export function useInitiative(type: InitiativeType, id: string, opts: { enabled: boolean }) {
  return useQuery<InitiativeListItem | null>({
    queryKey: initiativeDetailKey(type, id),
    enabled: opts.enabled,
    queryFn: async () => {
      const { kind } = INITIATIVE_CONFIG[type];
      const row = await new InitiativeRepository(type).getById(id);
      return row ? { ...row, kind } : null;
    },
  });
}
