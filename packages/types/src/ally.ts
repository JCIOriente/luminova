import type { Timestamp } from "firebase/firestore";
import type { AllyCategory } from "./engine/ally-public.js";

/** Persisted ally document (Firestore shape). Form input is `AllyInput`. */
export interface Ally {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  logoUrl: string | null;
  category: AllyCategory | null;
  active: boolean;
  deletedAt: Timestamp | null;
}
