import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectInput } from "@luminova/types";
import { ProjectRepository } from "../repositories/project-repository";
import { projectKeys } from "./project-keys";

export function useUpdateProject(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProjectInput }) =>
      new ProjectRepository().update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.byTerm(termId) }),
  });
}
