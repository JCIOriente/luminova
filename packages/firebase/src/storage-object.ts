import { getDownloadURL, ref, uploadBytes, deleteObject } from "firebase/storage";
import { getStorageService } from "./index";

export async function uploadObject(
  path: string,
  data: Blob,
  opts?: { contentType?: string },
): Promise<string> {
  const storageRef = ref(getStorageService(), path);
  await uploadBytes(storageRef, data, { contentType: opts?.contentType ?? "image/jpeg" });
  return await getDownloadURL(storageRef);
}

export async function deleteObjectQuietly(path: string): Promise<void> {
  const storageRef = ref(getStorageService(), path);
  try {
    await deleteObject(storageRef);
  } catch (err) {
    if ((err as { code?: string }).code !== "storage/object-not-found") throw err;
  }
}
