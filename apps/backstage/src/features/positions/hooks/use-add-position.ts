import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PositionInput } from "@luminova/types";
import { PositionRepository } from "../repositories/position-repository";
import { positionKeys } from "./position-keys";

export function useAddPosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PositionInput) => new PositionRepository().create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: positionKeys.all }),
  });
}
