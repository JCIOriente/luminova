import type { Timestamp } from "firebase/firestore";

export const MEMBER_STATUSES = ["Activo", "Inactivo", "Desafiliado"] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MEMBER_GENDERS = ["Masculino", "Femenino"] as const;
export type MemberGender = (typeof MEMBER_GENDERS)[number];

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
  /** Past-president flag → eligibility (cannot accrue Mejor Miembro points). Missing = false. */
  isPastPresident?: boolean;
  /** Linked Firebase Auth uid (member self-login). Set by `provisionMemberLogin`
   *  (admin SDK); absent until the member is invited. Immutable once set (rules). */
  uid?: string;
  active: boolean;
  deletedAt: Timestamp | null;
}
