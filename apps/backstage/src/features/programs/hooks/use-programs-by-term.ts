import { useQuery } from "@tanstack/react-query";
import { ProgramRepository } from "../repositories/program-repository";
import { programKeys } from "./program-keys";

export function useProgramsByTerm(termId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: programKeys.byTerm(termId),
    queryFn: () => new ProgramRepository().getByTerm(termId),
    enabled: options?.enabled ?? true,
  });
}
