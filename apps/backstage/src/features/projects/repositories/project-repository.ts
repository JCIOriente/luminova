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
import type { Project, ProjectInput } from "@luminova/types";
import {
  toInitiativeCreateDoc,
  toInitiativeUpdateDoc,
} from "../../initiatives/repositories/initiative-mapper";

export class ProjectRepository {
  private readonly collection = collection(getFirebase().db, "projects");

  async getByTerm(termId: string): Promise<Project[]> {
    const snapshot = await getDocs(query(this.collection, where("termId", "==", termId)));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) }))
      .sort((a, b) => a.title.localeCompare(b.title, "es"));
  }

  async getById(id: string): Promise<Project | null> {
    const snapshot = await getDoc(doc(this.collection, id));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<Project, "id">) };
  }

  async create(data: ProjectInput, termId: string): Promise<string> {
    const ref = await addDoc(this.collection, toInitiativeCreateDoc(data, termId));
    return ref.id;
  }

  async update(id: string, data: ProjectInput): Promise<void> {
    await updateDoc(doc(this.collection, id), toInitiativeUpdateDoc(data));
  }

  /** File the director's final report — the engine confirmation gate. */
  async fileFinalReport(id: string, uid: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Proyecto no encontrado.");
    if (existing.finalReport) throw new Error("El informe final ya fue presentado.");
    await updateDoc(doc(this.collection, id), {
      finalReport: { filedAt: serverTimestamp(), filedBy: uid },
      status: "Finalizado",
    });
  }
}
