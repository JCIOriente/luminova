import { useQuery } from "@tanstack/react-query";
import { RoleRepository } from "../repositories/role-repository";
import { roleKeys } from "./role-keys";

export function useRoles(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: roleKeys.all,
    queryFn: () => new RoleRepository().getAll(),
    enabled: options?.enabled ?? true,
  });
}
