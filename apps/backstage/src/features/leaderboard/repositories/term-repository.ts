import { doc, getDoc } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { Term } from "@luminova/types";

export class TermRepository {
  private readonly db = getFirebase().db;

  async getById(termId: string): Promise<Term | null> {
    const snapshot = await getDoc(doc(this.db, "terms", termId));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<Term, "id">) };
  }
}
