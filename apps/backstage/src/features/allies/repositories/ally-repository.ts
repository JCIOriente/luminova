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
import type { Ally } from "../types/ally";
import type { AllyInput } from "../types/ally-schema";
import { toAllyCreateDoc, toAllyUpdateDoc } from "./ally-mapper";

export class AllyRepository {
  private readonly collection = collection(getFirebase().db, "allies");

  /** Active (non-soft-deleted) allies, sorted by company name. */
  async getAll(): Promise<Ally[]> {
    const snapshot = await getDocs(query(this.collection, where("active", "==", true)));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Ally, "id">) }))
      .sort((a, b) => a.companyName.localeCompare(b.companyName, "es"));
  }

  async getById(id: string): Promise<Ally | null> {
    const snapshot = await getDoc(doc(this.collection, id));
    if (!snapshot.exists()) return null;
    const data = snapshot.data() as Omit<Ally, "id">;
    if (!data.active) return null;
    return { id: snapshot.id, ...data };
  }

  async create(data: AllyInput): Promise<string> {
    const ref = await addDoc(this.collection, toAllyCreateDoc(data));
    return ref.id;
  }

  async update(id: string, data: AllyInput): Promise<void> {
    await updateDoc(doc(this.collection, id), toAllyUpdateDoc(data));
  }

  /** Soft delete — never hard-delete an ally. */
  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), {
      active: false,
      deletedAt: serverTimestamp(),
    });
  }
}
