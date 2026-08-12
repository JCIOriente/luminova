import { getDb } from "@luminova/firebase/db";
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  roleDefinitionDocSchema,
  type RoleDefinition,
  type RoleDefinitionInput,
} from "@luminova/types";
import { parseDocs } from "../../../lib/firestore-read";

/** A new custom role doc: identity fields are fixed (built-ins are seeded by the
 *  beacon admin SDK, never the client — firestore.rules enforces builtIn:false). */
function toCreateDoc(data: RoleDefinitionInput): Omit<RoleDefinition, "id"> {
  return {
    name: data.name,
    description: data.description,
    permissions: data.permissions,
    builtIn: false,
    builtInKey: null,
    locked: false,
    active: true,
    deletedAt: null,
  };
}

export class RoleRepository {
  private readonly collection = collection(getDb(), "roles");

  /** EVERY role doc, built-ins first then customs, each alphabetical.
   *
   *  Unfiltered on purpose. /permisos must be able to show — and RESTORE — a
   *  deactivated role, and a `where("active","==",true)` here made it invisible to the
   *  only UI that could. Every ASSIGNMENT surface filters explicitly via
   *  `assignableRoles()` (apps/backstage/src/lib/role-lifecycle.ts); display surfaces
   *  deliberately don't, so a stored value always resolves its real name. */
  async getAll(): Promise<RoleDefinition[]> {
    const snapshot = await getDocs(this.collection);
    return parseDocs(roleDefinitionDocSchema, snapshot).sort((a, b) => {
      if (a.builtIn !== b.builtIn) return a.builtIn ? -1 : 1;
      return a.name.localeCompare(b.name, "es");
    });
  }

  async create(data: RoleDefinitionInput): Promise<string> {
    const ref = await addDoc(this.collection, toCreateDoc(data));
    return ref.id;
  }

  /** Edits only name/description/permissions; identity fields are immutable (rules). */
  async update(id: string, data: RoleDefinitionInput): Promise<void> {
    await updateDoc(doc(this.collection, id), {
      name: data.name,
      description: data.description,
      permissions: data.permissions,
    });
  }

  /** Soft delete — REVERSIBLE via `reactivate`. Built-ins are allowed now except
   *  `roles/Member` and the locked `roles/Admin` (firestore.rules). */
  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), {
      active: false,
      deletedAt: serverTimestamp(),
    });
  }

  /** Undo a soft delete. Writes BOTH fields: firestore.rules' roleLifecycleSafe()
   *  couples them (active:true requires deletedAt == null), and beacon's isActiveRoleDoc
   *  reads both — clearing only `active` leaves a doc that is live to getAll()'s sort and
   *  dead to the perms pipeline. */
  async reactivate(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), {
      active: true,
      deletedAt: null,
    });
  }
}
