import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ProgramRepository } from "../repositories/program-repository";
import { programKeys } from "./program-keys";

export function useFileProgramReport(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, uid }: { id: string; uid: string }) =>
      new ProgramRepository().fileFinalReport(id, uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: programKeys.byTerm(termId) }),
  });
}
