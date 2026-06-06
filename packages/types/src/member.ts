import type { Timestamp } from "firebase/firestore";

export const MEMBER_STATUSES = ["Activo", "Inactivo", "Desafiliado"] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Persisted member document (Firestore shape). Form input is `MemberInput`. */
export interface Member {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  profession?: string;
  joinDate: Timestamp;
  birthdate: Timestamp;
  status: MemberStatus;
  profilePicture: string | null;
  totalPoints: number;
  active: boolean;
  deletedAt: Timestamp | null;
}
