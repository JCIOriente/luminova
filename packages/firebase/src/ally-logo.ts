import { uploadObject, deleteObjectQuietly } from "./storage-object";

function logoPath(allyId: string): string {
  return `allies/${allyId}/logo`;
}

export function uploadAllyLogo(allyId: string, file: File): Promise<string> {
  return uploadObject(logoPath(allyId), file, { contentType: file.type });
}

export function deleteAllyLogo(allyId: string): Promise<void> {
  return deleteObjectQuietly(logoPath(allyId));
}
