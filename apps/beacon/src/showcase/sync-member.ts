import type { Firestore } from "firebase-admin/firestore";
import { isPublishableMember, toBoardCargo, type BoardCargo } from "./project-board.js";
import {
  MEMBER_PROJECT_CAP,
  careerCargoIds,
  projectMember,
  type MemberProjectSource,
} from "./project-member.js";

/**
 * Write or take down memberShowcase/{memberId} from the LIVE member doc, for the reason
 * onBoardMemberWritten gives: gen2 triggers have no ordering guarantee, and deciding from an
 * event payload lets a late invocation undo an opt-out. The transaction re-runs if the member
 * doc changes before commit, so the last committed state wins.
 */
export async function syncMemberShowcase(
  database: Firestore,
  memberId: string,
  projectId: string,
): Promise<void> {
  const memberRef = database.doc(`members/${memberId}`);
  const showcaseRef = database.doc(`memberShowcase/${memberId}`);
  await database.runTransaction(async (tx) => {
    const live = await tx.get(memberRef);
    const member = live.exists ? (live.data() as Record<string, unknown>) : null;
    if (!member || !isPublishableMember(member)) {
      tx.delete(showcaseRef);
      return;
    }
    const cargoRefs = careerCargoIds(member).map((id) => database.doc(`positions/${id}`));
    const [cargoSnaps, projectSnap] = await Promise.all([
      cargoRefs.length > 0 ? tx.getAll(...cargoRefs) : [],
      tx.get(
        database
          .collection("showcase")
          .where("memberIds", "array-contains", memberId)
          .select("title", "endDate", "impact", "team")
          .limit(MEMBER_PROJECT_CAP),
      ),
    ]);
    const cargos = new Map<string, BoardCargo>(
      cargoSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, toBoardCargo(snap)]),
    );
    const projects = projectSnap.docs.map((doc): MemberProjectSource => ({
      id: doc.id,
      ...doc.data(),
    }));
    const item = projectMember(memberId, member, cargos, projects, projectId);
    if (!item) {
      tx.delete(showcaseRef);
      return;
    }
    tx.set(showcaseRef, item);
  });
}
