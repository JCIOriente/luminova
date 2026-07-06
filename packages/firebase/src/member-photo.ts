import { uploadObject, deleteObjectQuietly } from "./storage-object";

function photoPath(memberId: string): string {
  return `members/${memberId}/profile.jpg`;
}

export function uploadMemberPhoto(memberId: string, blob: Blob): Promise<string> {
  return uploadObject(photoPath(memberId), blob);
}

export function deleteMemberPhoto(memberId: string): Promise<void> {
  return deleteObjectQuietly(photoPath(memberId));
}
