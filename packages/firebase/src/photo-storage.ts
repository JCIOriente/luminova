import { getDownloadURL, ref, uploadBytes, deleteObject } from "firebase/storage";
import type { InitiativeKind } from "@luminova/types";
import { getStorageService } from "./index";

const KIND_COLLECTION: Record<InitiativeKind, string> = {
  Program: "programs",
  Project: "projects",
};

export function initiativePhotoPath(kind: InitiativeKind, id: string, photoId: string): string {
  return `${KIND_COLLECTION[kind]}/${id}/photos/${photoId}.jpg`;
}

export function activityPhotoPath(activityId: string, photoId: string): string {
  return `activities/${activityId}/photos/${photoId}.jpg`;
}

async function upload(path: string, blob: Blob): Promise<string> {
  const storageRef = ref(getStorageService(), path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return await getDownloadURL(storageRef);
}

async function remove(path: string): Promise<void> {
  const storageRef = ref(getStorageService(), path);
  try {
    await deleteObject(storageRef);
  } catch (err) {
    if ((err as { code?: string }).code !== "storage/object-not-found") throw err;
  }
}

export function uploadInitiativePhoto(
  kind: InitiativeKind,
  id: string,
  photoId: string,
  blob: Blob,
): Promise<string> {
  return upload(initiativePhotoPath(kind, id, photoId), blob);
}

export function deleteInitiativePhoto(
  kind: InitiativeKind,
  id: string,
  photoId: string,
): Promise<void> {
  return remove(initiativePhotoPath(kind, id, photoId));
}

export function uploadActivityPhoto(
  activityId: string,
  photoId: string,
  blob: Blob,
): Promise<string> {
  return upload(activityPhotoPath(activityId, photoId), blob);
}

export function deleteActivityPhoto(activityId: string, photoId: string): Promise<void> {
  return remove(activityPhotoPath(activityId, photoId));
}
