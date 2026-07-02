import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import {
  currentTermKey,
  MEMBER_STATUSES,
  type Member,
  type MemberInput,
  type TermPositions,
} from "@luminova/types";
import { toMemberCreateDoc, toMemberUpdateDoc } from "./member-mapper";

export class MemberRepository {
  private readonly collection = collection(getFirebase().db, "members");

  private currentUid(): string {
    const uid = getFirebase().auth.currentUser?.uid;
    if (!uid) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    return uid;
  }

  /** Active (non-soft-deleted) members, sorted by name. */
  async getAll(): Promise<Member[]> {
    const snapshot = await getDocs(query(this.collection, where("active", "==", true)));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Member, "id">) }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  async getById(id: string): Promise<Member | null> {
    const snapshot = await getDoc(doc(this.collection, id));
    if (!snapshot.exists()) return null;
    const data = snapshot.data() as Omit<Member, "id">;
    if (!data.active) return null;
    return { id: snapshot.id, ...data };
  }

  /** The active member linked to an Auth uid (self-view), or null. */
  async getByUid(uid: string): Promise<Member | null> {
    const snapshot = await getDocs(
      query(this.collection, where("uid", "==", uid), where("active", "==", true), limit(1)),
    );
    const d = snapshot.docs[0];
    return d ? { id: d.id, ...(d.data() as Omit<Member, "id">) } : null;
  }

  async create(data: MemberInput): Promise<string> {
    const ref = await addDoc(this.collection, toMemberCreateDoc(data, this.currentUid()));
    return ref.id;
  }

  async update(
    id: string,
    data: MemberInput,
    // Required (may be null) so a caller can't silently forget it and reintroduce the
    // re-gate bug: an omitted current slot makes the mapper always re-stamp positions.
    currentPositions: Pick<TermPositions, "cargoId" | "comisionIds"> | null,
  ): Promise<void> {
    await updateDoc(
      doc(this.collection, id),
      toMemberUpdateDoc(data, this.currentUid(), currentPositions),
    );
  }

  /** ExecutiveCommittee org-chart edit: writes ONLY the current term's assignment
   *  (dot-path) so the positions-only rule path applies. */
  async setPositions(
    id: string,
    assignment: { cargoId: string | null; comisionIds: string[] },
    termKey = currentTermKey(),
  ): Promise<void> {
    await updateDoc(doc(this.collection, id), {
      [`positions.${termKey}`]: { ...assignment, assignedBy: this.currentUid() },
    });
  }

  /** Set or clear the profile photo URL. Its own action — never part of the form submit. */
  async setProfilePicture(id: string, url: string | null): Promise<void> {
    await updateDoc(doc(this.collection, id), { profilePicture: url });
  }

  /** Change membership standing only (Activo/Inactivo/Desafiliado). */
  async setStatus(id: string, status: Member["status"]): Promise<void> {
    if (!MEMBER_STATUSES.includes(status)) {
      throw new Error(`Invalid member status: ${status}`);
    }
    await updateDoc(doc(this.collection, id), { status });
  }

  /** Soft delete — never hard-delete a member. */
  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), {
      active: false,
      deletedAt: serverTimestamp(),
    });
  }
}
