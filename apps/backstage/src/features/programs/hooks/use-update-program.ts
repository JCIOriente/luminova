import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProgramInput } from "@luminova/types";
import { ProgramRepository } from "../repositories/program-repository";
import { programKeys } from "./program-keys";

export function useUpdateProgram(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProgramInput }) =>
      new ProgramRepository().update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: programKeys.byTerm(termId) }),
  });
}
