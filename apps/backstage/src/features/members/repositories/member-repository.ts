import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { Member } from "../types/member";
import type { MemberInput } from "../types/member-schema";
import { toMemberCreateDoc, toMemberUpdateDoc } from "./member-mapper";

export class MemberRepository {
  private readonly collection = collection(getFirebase().db, "members");

  /** Active (non-soft-deleted) members, sorted by name. */
  async getAll(): Promise<Member[]> {
    const snapshot = await getDocs(query(this.collection, where("active", "==", true)));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Member, "id">) }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  async getById(id: string): Promise<Member | null> {
    const snapshot = await getDoc(doc(this.collection, id));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<Member, "id">) };
  }

  async create(data: MemberInput): Promise<string> {
    const ref = await addDoc(this.collection, toMemberCreateDoc(data));
    return ref.id;
  }

  async update(id: string, data: MemberInput): Promise<void> {
    await updateDoc(doc(this.collection, id), toMemberUpdateDoc(data));
  }

  /** Soft delete — never hard-delete a member. */
  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), {
      active: false,
      deletedAt: serverTimestamp(),
    });
  }
}
