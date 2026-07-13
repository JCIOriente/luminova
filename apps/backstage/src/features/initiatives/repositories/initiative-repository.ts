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
import {
  initiativeDocSchema,
  type InitiativeCore,
  type InitiativeInput,
  type InitiativeImpactInput,
  type Photo,
} from "@luminova/types";
import {
  toInitiativeCreateDoc,
  toInitiativeUpdateDoc,
  toInitiativeCompleteDoc,
} from "./initiative-mapper";
import { removePhoto as dropPhoto, moveCover, setCaption as relabel } from "./photo-array";
import { parseDocOrNull, parseDocs } from "../../../lib/firestore-read";
import { INITIATIVE_CONFIG, type InitiativeType } from "../lib/initiative-kind";

/**
 * One repository for both initiative kinds. Constructed with the UI/route `type`
 * ("program" | "project"); the Firestore collection is resolved from
 * `INITIATIVE_CONFIG` internally, so the collection literal lives in exactly one
 * place and a wrong-kind construction is impossible.
 */
export class InitiativeRepository {
  private readonly collection;

  constructor(type: InitiativeType) {
    this.collection = collection(getFirebase().db, INITIATIVE_CONFIG[type].collection);
  }

  async getByTerm(termId: string): Promise<InitiativeCore[]> {
    const snapshot = await getDocs(query(this.collection, where("termId", "==", termId)));
    return parseDocs(initiativeDocSchema, snapshot).sort((a, b) =>
      a.title.localeCompare(b.title, "es"),
    );
  }

  async getById(id: string): Promise<InitiativeCore | null> {
    const snapshot = await getDoc(doc(this.collection, id));
    return parseDocOrNull(initiativeDocSchema, snapshot);
  }

  async create(data: InitiativeInput, termId: string): Promise<string> {
    const ref = await addDoc(this.collection, toInitiativeCreateDoc(data, termId));
    return ref.id;
  }

  async update(id: string, data: InitiativeInput): Promise<void> {
    await updateDoc(doc(this.collection, id), toInitiativeUpdateDoc(data));
  }

  /** Featured-only write for the list quick-toggle (rules' featuredUpdateSafe gates it). */
  async setFeatured(id: string, featured: boolean): Promise<void> {
    await updateDoc(doc(this.collection, id), { featured });
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
