import { addDoc, collection, getDocs, query } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Member } from '../types/member';
import { db, storage } from './firebase';

export async function addMember(member: Omit<Member, 'id'>) {
  try {
    let profilePictureUrl = '';
    if (member.profilePicture) {
      const storageRef = ref(storage, `members/${member.name}`);
      await uploadBytes(storageRef, member.profilePicture);
      profilePictureUrl = await getDownloadURL(storageRef);
    }

    // Add member to firestore
    const docRef = await addDoc(collection(db, 'members'), {
      ...member,
      profilePicture: profilePictureUrl,
      totalPoints: 0,
    });
    return docRef.id;
  } catch (error) {
    console.log('Error adding member: ', error);
    throw error;
  }
}

export async function listMembers(): Promise<Member[]> {
  try {
    const q = query(collection(db, "members"))
    const querySnapshot = await getDocs(q)
    const members: Member[] = []
    querySnapshot.forEach((doc) => {
      const data = doc.data() as Member
      const member: Member = {
        id: doc.id,
        ...data
      }
      members.push(member)
    })
    return members
  } catch (error) {
    console.log('Error listing members: ', error)
    throw error
  }
}
