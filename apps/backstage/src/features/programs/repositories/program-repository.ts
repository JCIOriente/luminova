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
import type { Program, ProgramInput } from "@luminova/types";
import { toProgramCreateDoc, toProgramUpdateDoc } from "./program-mapper";

export class ProgramRepository {
  private readonly collection = collection(getFirebase().db, "programs");

  async getByTerm(termId: string): Promise<Program[]> {
    const snapshot = await getDocs(query(this.collection, where("termId", "==", termId)));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Program, "id">) }))
      .sort((a, b) => a.title.localeCompare(b.title, "es"));
  }

  async getById(id: string): Promise<Program | null> {
    const snapshot = await getDoc(doc(this.collection, id));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<Program, "id">) };
  }

  async create(data: ProgramInput, termId: string): Promise<string> {
    const ref = await addDoc(this.collection, toProgramCreateDoc(data, termId));
    return ref.id;
  }

  async update(id: string, data: ProgramInput): Promise<void> {
    await updateDoc(doc(this.collection, id), toProgramUpdateDoc(data));
  }

  /** File the director's final report — the engine confirmation gate. */
  async fileFinalReport(id: string, uid: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Programa no encontrado.");
    if (existing.finalReport) throw new Error("El informe final ya fue presentado.");
    await updateDoc(doc(this.collection, id), {
      finalReport: { filedAt: serverTimestamp(), filedBy: uid },
      status: "Finalizado",
    });
  }
}
