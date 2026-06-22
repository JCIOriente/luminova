import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PermissionOverrides } from "@luminova/types";
import { MemberPermissionsRepository } from "../repositories/member-permissions-repository";

export function useSaveMemberPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      memberId,
      roleIds,
      permissionOverrides,
    }: {
      memberId: string;
      roleIds: string[];
      permissionOverrides: PermissionOverrides;
    }) => new MemberPermissionsRepository().save(memberId, { roleIds, permissionOverrides }),
    // Broad invalidation — matches the members list + any member-detail query key.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
  });
}
