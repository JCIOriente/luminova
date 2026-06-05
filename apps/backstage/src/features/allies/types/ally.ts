import type { Timestamp } from "firebase/firestore";

/** Persisted ally document (Firestore shape). Form input is `AllyInput`. */
export interface Ally {
  id: string;
  companyName: string;
  personInCharge: string;
  phone: string;
  email: string;
  active: boolean;
  deletedAt: Timestamp | null;
}
