import { getDownloadURL, ref, uploadBytes, deleteObject } from "firebase/storage";
import { getStorageService } from "./index";

function logoPath(allyId: string): string {
  return `allies/${allyId}/logo`;
}

export async function uploadAllyLogo(allyId: string, file: File): Promise<string> {
  const storageRef = ref(getStorageService(), logoPath(allyId));
  await uploadBytes(storageRef, file, { contentType: file.type });
  return await getDownloadURL(storageRef);
}

export async function deleteAllyLogo(allyId: string): Promise<void> {
  const storageRef = ref(getStorageService(), logoPath(allyId));
  try {
    await deleteObject(storageRef);
  } catch (err) {
    if ((err as { code?: string }).code !== "storage/object-not-found") throw err;
  }
}
