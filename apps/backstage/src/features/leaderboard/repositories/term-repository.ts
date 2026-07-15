import { doc, getDoc } from "firebase/firestore";
import { getDb } from "@luminova/firebase/db";
import { termDocSchema, type Term } from "@luminova/types";
import { parseDocOrNull } from "../../../lib/firestore-read";

export class TermRepository {
  private readonly db = getDb();

  async getById(termId: string): Promise<Term | null> {
    const snapshot = await getDoc(doc(this.db, "terms", termId));
    return parseDocOrNull(termDocSchema, snapshot);
  }
}
