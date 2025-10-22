import {
  Timestamp,
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

const toDateInputValue = (date: Date): string =>
  date.toISOString().split('T')[0];

const toDateFromInput = (value: string): Date =>
  new Date(`${value}T00:00:00`);

const formatStoredDate = (value: unknown): string => {
  if (value instanceof Timestamp) {
    return toDateInputValue(value.toDate());
  }

  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return toDateInputValue((value as { toDate: () => Date }).toDate());
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return toDateInputValue(parsed);
    }
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return toDateInputValue(parsed);
    }
  }

  return '';
};

export class EventRepository {
  static async getEvents(): Promise<Event[]> {
    const q = query(collection(db, COLLECTION_NAME));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        type: data.type,
        name: data.name,
        description: data.description ?? '',
        scope: data.scope ?? 'Local',
        directorId: data.directorId,
        coDirectorIds: data.coDirectorIds ?? [],
        collaboratorIds: data.collaboratorIds ?? [],
        participantIds: data.participantIds ?? [],
        parentId: data.parentId ?? '',
        startDate: formatStoredDate(data.startDate),
        endDate: formatStoredDate(data.endDate),
      };
    });
  }

  static async addEvent(event: EventInput): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...event,
      startDate: Timestamp.fromDate(toDateFromInput(event.startDate)),
      endDate: Timestamp.fromDate(toDateFromInput(event.endDate)),
    });
    return docRef.id;
  }

  static async updateEvent(
    id: string,
    updatedData: Partial<EventInput>,
  ): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const payload: Record<string, unknown> = {};

    Object.entries(updatedData).forEach(([key, value]) => {
      if (value !== undefined && key !== 'startDate' && key !== 'endDate') {
        payload[key] = value;
      }
    });

    if (updatedData.startDate) {
      payload.startDate = Timestamp.fromDate(
        toDateFromInput(updatedData.startDate),
      );
    }

    if (updatedData.endDate) {
      payload.endDate = Timestamp.fromDate(
        toDateFromInput(updatedData.endDate),
      );
    }

    await updateDoc(docRef, payload);
  }

  static async deleteEvent(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
}
