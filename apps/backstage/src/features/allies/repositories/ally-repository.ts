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
import { allyDocSchema, type Ally, type AllyInput } from "@luminova/types";
import { parseDocOrNull, parseDocs } from "../../../lib/firestore-read";
import { toAllyCreateDoc, toAllyUpdateDoc } from "./ally-mapper";

export class AllyRepository {
  private readonly collection = collection(getFirebase().db, "allies");

  /** Active (non-soft-deleted) allies, sorted by company name. */
  async getAll(): Promise<Ally[]> {
    const snapshot = await getDocs(query(this.collection, where("active", "==", true)));
    return parseDocs(allyDocSchema, snapshot).sort((a, b) =>
      a.companyName.localeCompare(b.companyName, "es"),
    );
  }

  async getById(id: string): Promise<Ally | null> {
    const snapshot = await getDoc(doc(this.collection, id));
    const ally = parseDocOrNull(allyDocSchema, snapshot);
    return ally?.active ? ally : null;
  }

  async create(data: AllyInput): Promise<string> {
    const ref = await addDoc(this.collection, toAllyCreateDoc(data));
    return ref.id;
  }

  async update(id: string, data: AllyInput): Promise<void> {
    await updateDoc(doc(this.collection, id), toAllyUpdateDoc(data));
  }

  /** Persist the uploaded logo URL — written separately from the editable form fields. */
  async setLogo(id: string, logoUrl: string): Promise<void> {
    await updateDoc(doc(this.collection, id), { logoUrl });
  }

  async clearLogo(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), { logoUrl: null });
  }

  /** Soft delete — never hard-delete an ally. */
  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), {
      active: false,
      deletedAt: serverTimestamp(),
    });
  }
}
