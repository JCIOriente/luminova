import type { Timestamp } from "firebase/firestore";
import type { TermPositions } from "./position.js";
import type { PermissionOverrides } from "./permission-overrides.js";

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
  profession?: string;
  joinDate: Timestamp;
  birthdate: Timestamp;
  status: MemberStatus;
  profilePicture: string | null;
  totalPoints: number;
  /** Past-president flag → eligibility (cannot accrue Mejor Miembro points). Missing = false. */
  isPastPresident?: boolean;
  /** Missing on pre-K2 docs; required by the form from K2 on. */
  gender?: MemberGender;
  /** Member opt-in to appear on the public Directiva projection (boardShowcase).
   *  Self-set on /me. Missing = not published. */
  publicProfile?: boolean;
  /** Position assignments keyed by term (year, e.g. "2026"). */
  positions?: Record<string, TermPositions>;
  /** Linked Firebase Auth uid (member self-login). Set by `provisionMemberLogin`
   *  (admin SDK); absent until the member is invited. Immutable once set (rules). */
  uid?: string;
  /** Custom role ids assigned directly (Admin-only; positions confer built-in roles). */
  roleIds?: string[];
  /** Per-member coarse permission grants/revocations layered on resolved role perms. */
  permissionOverrides?: PermissionOverrides;
  active: boolean;
  deletedAt: Timestamp | null;
}
