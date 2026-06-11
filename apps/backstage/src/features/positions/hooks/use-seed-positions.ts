import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PositionRepository } from "../repositories/position-repository";
import { CEL_SEED } from "../lib/cel-seed";
import { positionKeys } from "./position-keys";

export function useSeedPositions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => new PositionRepository().seed(CEL_SEED),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: positionKeys.all }),
  });
}
