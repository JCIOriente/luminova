import { getFirebase } from "@luminova/firebase";
import { doc, updateDoc } from "firebase/firestore";
import type { PermissionOverrides } from "@luminova/types";

/** Writes only the permission-assignment fields on a member doc. Admin-only at the
 *  firestore.rules layer (roleIds + permissionOverrides are Admin-gated); the beacon
 *  onMemberWritten trigger re-resolves the member's `perms` claim from these. */
export class MemberPermissionsRepository {
  async save(
    memberId: string,
    data: { roleIds: string[]; permissionOverrides: PermissionOverrides },
  ): Promise<void> {
    await updateDoc(doc(getFirebase().db, "members", memberId), {
      roleIds: data.roleIds,
      permissionOverrides: data.permissionOverrides,
    });
  }
}
