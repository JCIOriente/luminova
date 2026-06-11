import { useQuery } from "@tanstack/react-query";
import { PositionRepository } from "../repositories/position-repository";
import { positionKeys } from "./position-keys";

export function usePositions(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: positionKeys.all,
    queryFn: () => new PositionRepository().getAll(),
    enabled: options?.enabled ?? true,
  });
}
