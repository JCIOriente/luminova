import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { Activity, ActivityInput } from "@luminova/types";
import { toActivityCreateDoc } from "./activity-mapper";

export class ActivityRepository {
  private readonly db = getFirebase().db;
  private readonly collection = collection(this.db, "activities");

  /** Activities for a term, newest start first. */
  async getByTerm(termId: string): Promise<Activity[]> {
    const snapshot = await getDocs(query(this.collection, where("termId", "==", termId)));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Activity, "id">) }))
      .sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis());
  }

  async create(data: ActivityInput, termId: string): Promise<string> {
    const ref = await addDoc(this.collection, toActivityCreateDoc(data, termId));
    return ref.id;
  }
}
