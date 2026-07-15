import { getDb } from "@luminova/firebase/db";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
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

  /** Active roles, built-ins first then customs, each alphabetical. */
  async getAll(): Promise<RoleDefinition[]> {
    const snapshot = await getDocs(query(this.collection, where("active", "==", true)));
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

  /** Soft delete — custom roles only; built-ins can't be deactivated (rules). */
  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), {
      active: false,
      deletedAt: serverTimestamp(),
    });
  }
}
