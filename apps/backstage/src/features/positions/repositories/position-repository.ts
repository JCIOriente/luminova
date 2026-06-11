import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
  limit,
} from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { Position, PositionInput } from "@luminova/types";
import { toPositionCreateDoc, toPositionUpdateDoc } from "./position-mapper";

export class PositionRepository {
  private readonly collection = collection(getFirebase().db, "positions");

  /** Active catalog entries: CEL, then JDL, then comisiones; alphabetical inside. */
  async getAll(): Promise<Position[]> {
    const snapshot = await getDocs(query(this.collection, where("active", "==", true)));
    const order: Record<string, number> = { CEL: 0, JDL: 1, Comision: 2 };
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Position, "id">) }))
      .sort(
        (a, b) =>
          (order[a.category] ?? 3) - (order[b.category] ?? 3) ||
          a.title.localeCompare(b.title, "es"),
      );
  }

  async create(data: PositionInput): Promise<string> {
    const ref = await addDoc(this.collection, toPositionCreateDoc(data));
    return ref.id;
  }

  async update(id: string, data: PositionInput): Promise<void> {
    await updateDoc(doc(this.collection, id), toPositionUpdateDoc(data));
  }

  /** Soft delete — assignments referencing the id keep resolving for history. */
  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), { active: false, deletedAt: serverTimestamp() });
  }

  /** One-shot CEL bootstrap: atomic, and refuses to run on a non-empty catalog. */
  async seed(entries: PositionInput[]): Promise<void> {
    const existing = await getDocs(query(this.collection, limit(1)));
    if (!existing.empty) {
      throw new Error("Positions catalog is not empty; seed skipped.");
    }
    const batch = writeBatch(getFirebase().db);
    for (const entry of entries) {
      batch.set(doc(this.collection), toPositionCreateDoc(entry));
    }
    await batch.commit();
  }
}
