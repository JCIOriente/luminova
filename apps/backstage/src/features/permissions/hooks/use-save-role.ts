import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RoleDefinitionInput } from "@luminova/types";
import { RoleRepository } from "../repositories/role-repository";
import { roleKeys } from "./role-keys";

export function useAddRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RoleDefinitionInput) => new RoleRepository().create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roleKeys.all }),
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RoleDefinitionInput }) =>
      new RoleRepository().update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roleKeys.all }),
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new RoleRepository().softDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roleKeys.all }),
  });
}

export function useReactivateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => new RoleRepository().reactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roleKeys.all }),
  });
}
