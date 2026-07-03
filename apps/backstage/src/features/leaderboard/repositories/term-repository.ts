import { doc, getDoc } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import { termDocSchema, type Term } from "@luminova/types";
import { parseDocOrNull } from "../../../lib/firestore-read";

export class TermRepository {
  private readonly db = getFirebase().db;

  async getById(termId: string): Promise<Term | null> {
    const snapshot = await getDoc(doc(this.db, "terms", termId));
    return parseDocOrNull(termDocSchema, snapshot);
  }
}
