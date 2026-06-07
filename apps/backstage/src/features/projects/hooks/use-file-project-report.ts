import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ProjectRepository } from "../repositories/project-repository";
import { projectKeys } from "./project-keys";

export function useFileProjectReport(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, uid }: { id: string; uid: string }) =>
      new ProjectRepository().fileFinalReport(id, uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.byTerm(termId) }),
  });
}
