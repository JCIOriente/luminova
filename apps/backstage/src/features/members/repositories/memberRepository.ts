import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDocs,
  limit,
  query,
  startAfter,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../../libs/firebase';
import { Member } from '../types/member';

export class MemberRepository {
  static async getMembers(
    pageSize: number,
    lastDoc: DocumentData | null,
  ): Promise<{ members: Member[]; lastDoc: DocumentData | null }> {
    let q = query(collection(db, 'members'), limit(pageSize));
    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }
    const querySnapshot = await getDocs(q);

    const members: Member[] = [];
    querySnapshot.forEach((doc) => {
      members.push({ id: doc.id, ...doc.data() } as Member);
    });

    const ld = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
    return {
      members,
      lastDoc: ld,
    };
  }

  static async addMember(member: Omit<Member, 'id'>): Promise<string> {
    let profilePictureUrl = '';
    if (member.profilePicture) {
      const storageRef = ref(storage, `members/${member.profilePicture.name}`);
      await uploadBytes(storageRef, member.profilePicture);
      profilePictureUrl = await getDownloadURL(storageRef);
    }

    const docRef = await addDoc(collection(db, 'members'), {
      ...member,
      profilePicture: profilePictureUrl,
      totalPoints: 0,
    });
    return docRef.id;
  }

  static async updateMember(
    id: string,
    member: Partial<Member>,
  ): Promise<void> {
    const profilePicture = member.profilePicture || '';
    await updateDoc(doc(db, 'members', id), {
      ...member,
      profilePicture,
    });
  }

  static async deleteMember(id: string): Promise<void> {
    await deleteDoc(doc(db, 'members', id));
  }
}
