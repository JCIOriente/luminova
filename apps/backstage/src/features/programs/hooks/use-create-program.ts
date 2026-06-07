import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProgramInput } from "@luminova/types";
import { ProgramRepository } from "../repositories/program-repository";
import { programKeys } from "./program-keys";

export function useCreateProgram(termId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProgramInput) => new ProgramRepository().create(data, termId),
    onSuccess: () => qc.invalidateQueries({ queryKey: programKeys.byTerm(termId) }),
  });
}
