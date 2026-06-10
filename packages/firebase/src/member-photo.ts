import { getDownloadURL, ref, uploadBytes, deleteObject } from "firebase/storage";
import { getStorageService } from "./index";

function photoPath(memberId: string): string {
  return `members/${memberId}/profile.jpg`;
}

export async function uploadMemberPhoto(memberId: string, blob: Blob): Promise<string> {
  const storageRef = ref(getStorageService(), photoPath(memberId));
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return await getDownloadURL(storageRef);
}

export async function deleteMemberPhoto(memberId: string): Promise<void> {
  const storageRef = ref(getStorageService(), photoPath(memberId));
  try {
    await deleteObject(storageRef);
  } catch (err) {
    // A missing object is a no-op (already gone); rethrow anything else to the caller.
    if ((err as { code?: string }).code !== "storage/object-not-found") throw err;
  }
}
