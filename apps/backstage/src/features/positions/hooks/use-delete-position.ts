import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PositionRepository } from "../repositories/position-repository";
import { positionKeys } from "./position-keys";

export function useDeletePosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new PositionRepository().softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: positionKeys.all }),
  });
}
