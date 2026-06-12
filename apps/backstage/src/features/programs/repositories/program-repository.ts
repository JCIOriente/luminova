import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  arrayUnion,
} from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { Program, ProgramInput, InitiativeImpactInput, Photo } from "@luminova/types";
import {
  toInitiativeCreateDoc,
  toInitiativeUpdateDoc,
  toInitiativeCompleteDoc,
} from "../../initiatives/repositories/initiative-mapper";
import {
  removePhoto as dropPhoto,
  moveCover,
  setCaption as relabel,
} from "../../initiatives/repositories/photo-array";

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
    const ref = await addDoc(this.collection, toInitiativeCreateDoc(data, termId));
    return ref.id;
  }

  async update(id: string, data: ProgramInput): Promise<void> {
    await updateDoc(doc(this.collection, id), toInitiativeUpdateDoc(data));
  }

  /** The completion wizard's atomic trio write — the engine confirmation gate. */
  async complete(id: string, impact: InitiativeImpactInput, uid: string): Promise<void> {
    await updateDoc(doc(this.collection, id), toInitiativeCompleteDoc(impact, uid));
  }

  async addPhoto(id: string, photo: Photo): Promise<void> {
    await updateDoc(doc(this.collection, id), { photos: arrayUnion(photo) });
  }

  async removePhoto(id: string, photoId: string): Promise<void> {
    const row = await this.getById(id);
    if (!row) throw new Error("Iniciativa no encontrada.");
    await updateDoc(doc(this.collection, id), { photos: dropPhoto(row.photos, photoId) });
  }

  async setCover(id: string, photoId: string): Promise<void> {
    const row = await this.getById(id);
    if (!row) throw new Error("Iniciativa no encontrada.");
    await updateDoc(doc(this.collection, id), { photos: moveCover(row.photos, photoId) });
  }

  async setCaption(id: string, photoId: string, caption: string): Promise<void> {
    const row = await this.getById(id);
    if (!row) throw new Error("Iniciativa no encontrada.");
    await updateDoc(doc(this.collection, id), { photos: relabel(row.photos, photoId, caption) });
  }
}
