import { useQuery } from "@tanstack/react-query";
import type { InitiativeKind } from "@luminova/types";
import { ProgramRepository } from "../../programs/repositories/program-repository";
import { ProjectRepository } from "../../projects/repositories/project-repository";
import type { InitiativeListItem } from "../lib/initiative-list-item";

export type InitiativeType = "program" | "project";

export const KIND: Record<InitiativeType, InitiativeKind> = {
  program: "Program",
  project: "Project",
};

export const INITIATIVE_TYPE: Record<InitiativeKind, InitiativeType> = {
  Program: "program",
  Project: "project",
};

export const initiativeDetailKey = (type: InitiativeType, id: string) =>
  ["initiatives", "detail", type, id] as const;

export function useInitiative(type: InitiativeType, id: string, opts: { enabled: boolean }) {
  return useQuery<InitiativeListItem | null>({
    queryKey: initiativeDetailKey(type, id),
    enabled: opts.enabled,
    queryFn: async () => {
      const kind = KIND[type];
      const row =
        type === "program"
          ? await new ProgramRepository().getById(id)
          : await new ProjectRepository().getById(id);
      return row ? { ...row, kind } : null;
    },
  });
}
