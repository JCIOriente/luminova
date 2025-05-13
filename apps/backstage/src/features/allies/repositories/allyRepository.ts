import { db } from '../../../libs/firebase'; // Assuming you have a firebase config
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  // Add other Firestore functions if needed, e.g., for pagination
} from 'firebase/firestore';
import type { Ally, AllyInput } from '../types/ally';

const ALLIES_COLLECTION = 'allies';

export const AllyRepository = {
  // Add a new ally
  addAlly: async (allyInput: AllyInput): Promise<Ally> => {
    const docRef = await addDoc(collection(db, ALLIES_COLLECTION), allyInput);
    return { id: docRef.id, ...allyInput };
  },

  // Get all allies
  getAllies: async (): Promise<Ally[]> => {
    const alliesQuery = query(
      collection(db, ALLIES_COLLECTION),
      orderBy('companyName'), // Optional: order by company name
    );
    const snapshot = await getDocs(alliesQuery);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as AllyInput),
    }));
  },

  // Update an existing ally
  updateAlly: async (
    id: string,
    updatedData: Partial<AllyInput>,
  ): Promise<void> => {
    const allyDocRef = doc(db, ALLIES_COLLECTION, id);
    await updateDoc(allyDocRef, updatedData);
  },

  // Delete an ally
  deleteAlly: async (id: string): Promise<void> => {
    const allyDocRef = doc(db, ALLIES_COLLECTION, id);
    await deleteDoc(allyDocRef);
  },
};