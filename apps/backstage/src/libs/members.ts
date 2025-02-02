import { db, storage } from './firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Member } from '../types/member';

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
