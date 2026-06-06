import { useQuery } from "@tanstack/react-query";
import { AllyRepository } from "../repositories/ally-repository";
import { allyKeys } from "./ally-keys";

export function useAllies() {
  return useQuery({
    queryKey: allyKeys.all,
    queryFn: () => new AllyRepository().getAll(),
  });
}
