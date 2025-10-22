import {
  QueryDocumentSnapshot,
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../../libs/firebase';
import type { Member, MemberInput } from '../types/member';

type MembersPage = {
  members: Member[];
  lastDoc: QueryDocumentSnapshot | null;
};

const isFileInstance = (value: unknown): value is File =>
  typeof File !== 'undefined' && value instanceof File;

export class MemberRepository {
  static async getMembers(
    pageSize: number,
    lastDoc: QueryDocumentSnapshot | null,
  ): Promise<MembersPage> {
    let membersQuery = query(
      collection(db, 'members'),
      where('active', '==', true),
      limit(pageSize),
    );

    if (lastDoc) {
      membersQuery = query(membersQuery, startAfter(lastDoc));
    }

    const querySnapshot = await getDocs(membersQuery);

    const members = querySnapshot.docs.map((docSnap) =>
      MemberRepository.toMember(docSnap),
    );

    const nextCursor =
      querySnapshot.docs.length > 0
        ? querySnapshot.docs[querySnapshot.docs.length - 1]
        : null;

    return {
      members,
      lastDoc: nextCursor,
    };
  }

  static async addMember(member: MemberInput): Promise<string> {
    const profilePictureUrl = await MemberRepository.resolveProfilePictureUrl(
      member.profilePicture,
    );

    const docRef = await addDoc(collection(db, 'members'), {
      name: member.name,
      email: member.email,
      phone: member.phone ?? '',
      role: member.role,
      profilePicture: profilePictureUrl,
      totalPoints: 0,
      active: true,
      deletedAt: null,
    });

    return docRef.id;
  }

  static async updateMember(
    id: string,
    member: Partial<MemberInput & Pick<Member, 'totalPoints' | 'active'>>,
  ): Promise<void> {
    const docRef = doc(db, 'members', id);
    const updatePayload: Record<string, unknown> = {};

    if (member.name !== undefined) updatePayload.name = member.name;
    if (member.email !== undefined) updatePayload.email = member.email;
    if (member.phone !== undefined) updatePayload.phone = member.phone;
    if (member.role !== undefined) updatePayload.role = member.role;
    if (member.totalPoints !== undefined)
      updatePayload.totalPoints = member.totalPoints;
    if (member.active !== undefined) updatePayload.active = member.active;

    if (member.profilePicture !== undefined) {
      const profilePictureUrl =
        await MemberRepository.resolveProfilePictureUrl(
          member.profilePicture,
        );
      updatePayload.profilePicture = profilePictureUrl;
    }

    if (Object.keys(updatePayload).length > 0) {
      await updateDoc(docRef, updatePayload);
    }
  }

  static async deleteMember(id: string): Promise<void> {
    const docRef = doc(db, 'members', id);
    await updateDoc(docRef, {
      active: false,
      deletedAt: serverTimestamp(),
    });
  }

  private static toMember(docSnap: QueryDocumentSnapshot): Member {
    const data = docSnap.data();

    return {
      id: docSnap.id,
      name: data.name,
      email: data.email,
      phone: data.phone ?? '',
      role: data.role,
      profilePicture: data.profilePicture ?? '',
      totalPoints: data.totalPoints ?? 0,
      active: data.active !== false,
      deletedAt: data.deletedAt?.toDate
        ? data.deletedAt.toDate()
        : data.deletedAt ?? null,
    };
  }

  private static async resolveProfilePictureUrl(
    profilePicture: MemberInput['profilePicture'],
  ): Promise<string> {
    if (profilePicture == null || profilePicture === '') {
      return '';
    }

    if (isFileInstance(profilePicture)) {
      const storageRef = ref(storage, `members/${profilePicture.name}`);
      await uploadBytes(storageRef, profilePicture);
      return await getDownloadURL(storageRef);
    }

    return profilePicture;
  }
}

export type { MembersPage };
