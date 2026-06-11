import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PositionInput } from "@luminova/types";
import { PositionRepository } from "../repositories/position-repository";
import { positionKeys } from "./position-keys";

export function useUpdatePosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PositionInput }) =>
      new PositionRepository().update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: positionKeys.all }),
  });
}
