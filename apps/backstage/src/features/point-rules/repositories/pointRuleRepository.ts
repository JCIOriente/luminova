import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../../libs/firebase';
import { PointRule, PointRuleInput } from '../types/pointRule';

const COLLECTION_NAME = 'pointsTable';

export class PointRuleRepository {
  static async getPointRules(): Promise<PointRule[]> {
    const q = query(collection(db, COLLECTION_NAME));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as PointRule,
    );
  }

  static async addPointRule(entry: PointRuleInput): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), entry);
    return docRef.id;
  }

  static async updatePointRule(
    id: string,
    updatedData: Partial<PointRuleInput>,
  ): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, updatedData);
  }

  static async deletePointRule(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
}
