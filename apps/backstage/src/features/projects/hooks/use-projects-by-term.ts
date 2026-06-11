import { useQuery } from "@tanstack/react-query";
import { ProjectRepository } from "../repositories/project-repository";
import { projectKeys } from "./project-keys";

export function useProjectsByTerm(termId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: projectKeys.byTerm(termId),
    queryFn: () => new ProjectRepository().getByTerm(termId),
    enabled: options?.enabled ?? true,
  });
}
