import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectInput } from "@luminova/types";
import { ProjectRepository } from "../repositories/project-repository";
import { projectKeys } from "./project-keys";

export function useCreateProject(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectInput) => new ProjectRepository().create(data, termId),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.byTerm(termId) }),
  });
}
