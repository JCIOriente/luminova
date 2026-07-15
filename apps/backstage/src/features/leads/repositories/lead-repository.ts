import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { getDb } from "@luminova/firebase/db";
import { leadDocSchema, type Lead, type LeadStatus } from "@luminova/types";
import { parseDocs } from "../../../lib/firestore-read";

// Bound the read: newest 500 live leads. The `where + orderBy` needs the composite
// index in firestore.indexes.json (leads: deletedAt ASC, createdAt DESC) — deploy
// it before this query runs in prod. Ordering server-side means the cap drops the
// OLDEST leads, not arbitrary doc-ID ones; revisit with pagination if the inbox
// ever nears the cap.
const LEAD_READ_CAP = 500;

export class LeadRepository {
  private readonly collection = collection(getDb(), "leads");

  /** Live (non-soft-deleted) leads, newest first. */
  async getAll(): Promise<Lead[]> {
    const snapshot = await getDocs(
      query(
        this.collection,
        where("deletedAt", "==", null),
        orderBy("createdAt", "desc"),
        limit(LEAD_READ_CAP),
      ),
    );
    return parseDocs(leadDocSchema, snapshot);
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
