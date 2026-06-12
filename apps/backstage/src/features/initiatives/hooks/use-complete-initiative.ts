import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InitiativeImpactInput } from "@luminova/types";
import { ProgramRepository } from "../../programs/repositories/program-repository";
import { ProjectRepository } from "../../projects/repositories/project-repository";
import { programKeys } from "../../programs/hooks/program-keys";
import { projectKeys } from "../../projects/hooks/project-keys";
import type { InitiativeType } from "./use-initiative";

export function useCompleteInitiative(type: InitiativeType, termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      impact,
      uid,
    }: {
      id: string;
      impact: InitiativeImpactInput;
      uid: string;
    }) =>
      type === "program"
        ? new ProgramRepository().complete(id, impact, uid)
        : new ProjectRepository().complete(id, impact, uid),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: type === "program" ? programKeys.byTerm(termId) : projectKeys.byTerm(termId),
      }),
  });
}
