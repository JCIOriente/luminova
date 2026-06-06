import { useQuery } from "@tanstack/react-query";
import { TermRepository } from "../repositories/term-repository";

export function useTerm(id: string) {
  return useQuery({ queryKey: ["terms", id], queryFn: () => new TermRepository().getById(id) });
}
