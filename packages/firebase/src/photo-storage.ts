import type { InitiativeKind } from "@luminova/types";
import { uploadObject, deleteObjectQuietly } from "./storage-object";

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

export function uploadInitiativePhoto(
  kind: InitiativeKind,
  id: string,
  photoId: string,
  blob: Blob,
): Promise<string> {
  return uploadObject(initiativePhotoPath(kind, id, photoId), blob);
}

export function deleteInitiativePhoto(
  kind: InitiativeKind,
  id: string,
  photoId: string,
): Promise<void> {
  return deleteObjectQuietly(initiativePhotoPath(kind, id, photoId));
}

export function uploadActivityPhoto(
  activityId: string,
  photoId: string,
  blob: Blob,
): Promise<string> {
  return uploadObject(activityPhotoPath(activityId, photoId), blob);
}

export function deleteActivityPhoto(activityId: string, photoId: string): Promise<void> {
  return deleteObjectQuietly(activityPhotoPath(activityId, photoId));
}
