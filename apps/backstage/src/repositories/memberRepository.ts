import { db, storage } from '../libs/firebase';
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Member } from '../types/member';

export class MemberRepository {
  static async getMembers(): Promise<Member[]> {
    const querySnapshot = await getDocs(collection(db, 'members'));
    const members: Member[] = [];
    querySnapshot.forEach((doc) => {
      members.push({ id: doc.id, ...doc.data() } as Member);
    });
    return members;
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
