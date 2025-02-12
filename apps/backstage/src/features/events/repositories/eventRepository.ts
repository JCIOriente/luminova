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
import type { Event, EventInput } from '../types/event';

const COLLECTION_NAME = 'events';

export class EventRepository {
  static async getEvents(): Promise<Event[]> {
    const q = query(collection(db, COLLECTION_NAME));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Event);
  }

  static async addEvent(event: EventInput): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), event);
    return docRef.id;
  }

  static async updateEvent(
    id: string,
    updatedData: Partial<EventInput>,
  ): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, updatedData);
  }

  static async deleteEvent(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
}
