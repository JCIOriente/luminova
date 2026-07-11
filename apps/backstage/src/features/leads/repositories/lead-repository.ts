import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import { leadDocSchema, type Lead, type LeadStatus } from "@luminova/types";
import { parseDocs } from "../../../lib/firestore-read";

// Bound the read: JCI Oriente lead volume is small. A `where("deletedAt","==",null)`
// + `createdAt desc` order would need a composite index, so we cap at 500 live
// leads and sort newest-first client-side instead. Revisit with pagination + a
// composite index if the inbox ever approaches the cap.
const LEAD_READ_CAP = 500;

export class LeadRepository {
  private readonly collection = collection(getFirebase().db, "leads");

  /** Live (non-soft-deleted) leads, newest first. */
  async getAll(): Promise<Lead[]> {
    const snapshot = await getDocs(
      query(this.collection, where("deletedAt", "==", null), limit(LEAD_READ_CAP)),
    );
    return parseDocs(leadDocSchema, snapshot).sort(
      (a, b) => b.createdAt.toMillis() - a.createdAt.toMillis(),
    );
  }

  /** Advance the triage pipeline (Nuevo -> Contactado -> Cerrado). */
  async updateStatus(id: string, status: LeadStatus): Promise<void> {
    await updateDoc(doc(this.collection, id), { status });
  }

  /** Soft delete — never hard-delete a lead (the rules deny it). */
  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), { deletedAt: serverTimestamp() });
  }
}
