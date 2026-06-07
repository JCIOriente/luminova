import { useQuery } from "@tanstack/react-query";
import { ProjectRepository } from "../repositories/project-repository";
import { projectKeys } from "./project-keys";

export function useProjectsByTerm(termId: string) {
  return useQuery({
    queryKey: projectKeys.byTerm(termId),
    queryFn: () => new ProjectRepository().getByTerm(termId),
  });
}
