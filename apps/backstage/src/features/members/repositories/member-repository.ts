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
import { getDb } from "@luminova/firebase/db";
import {
  currentTermKey,
  MEMBER_STATUSES,
  memberDocSchema,
  type Member,
  type MemberInput,
  type SelfProfileInput,
  type TermPositions,
} from "@luminova/types";
import { parseDoc, parseDocOrNull, parseDocs } from "../../../lib/firestore-read";
import { toMemberCreateDoc, toMemberUpdateDoc, toSelfProfileDoc } from "./member-mapper";

export class MemberRepository {
  private readonly collection = collection(getDb(), "members");

  private currentUid(): string {
    const uid = getFirebase().auth.currentUser?.uid;
    if (!uid) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    return uid;
  }

  /** Active (non-soft-deleted) members, sorted by name. */
  async getAll(): Promise<Member[]> {
    const snapshot = await getDocs(query(this.collection, where("active", "==", true)));
    return parseDocs(memberDocSchema, snapshot).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  async getById(id: string): Promise<Member | null> {
    const snapshot = await getDoc(doc(this.collection, id));
    const member = parseDocOrNull(memberDocSchema, snapshot);
    return member?.active ? member : null;
  }

  /** The active member linked to an Auth uid (self-view), or null. */
  async getByUid(uid: string): Promise<Member | null> {
    const snapshot = await getDocs(
      query(this.collection, where("uid", "==", uid), where("active", "==", true), limit(1)),
    );
    const d = snapshot.docs[0];
    return d ? parseDoc(memberDocSchema, d) : null;
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

  /** Self-service profile edit (/me). Separate from `update` because the rules' self lane
   *  accepts only these keys — running the full form payload through it would deny. */
  async updateSelfProfile(id: string, data: SelfProfileInput): Promise<void> {
    await updateDoc(doc(this.collection, id), toSelfProfileDoc(data));
  }

  /** Org-chart edit: writes ONLY the current term's assignment (dot-path). The dedicated
   *  ExecutiveCommittee positions-only rule this used to target is gone — the write now
   *  goes through the ordinary `update:Member` lane plus `positionsAssignmentSafe()`, so
   *  the narrow payload is about not tripping those constraints, not about a separate
   *  allow-rule. */
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

  /** Admin takedown: force the member off the public Directiva. Writes `false` and only
   *  `false` — the rules arm backing this rejects any other value and any second field,
   *  so publication can never be turned back on from here. */
  async unpublishProfile(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), { publicProfile: false });
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
