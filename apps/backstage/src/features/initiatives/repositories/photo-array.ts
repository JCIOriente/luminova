import type { Photo } from "@luminova/types";

export function removePhoto(photos: Photo[], photoId: string): Photo[] {
  return photos.filter((p) => p.id !== photoId);
}

export function moveCover(photos: Photo[], photoId: string): Photo[] {
  const target = photos.find((p) => p.id === photoId);
  if (!target) return photos;
  return [target, ...photos.filter((p) => p.id !== photoId)];
}

export function setCaption(photos: Photo[], photoId: string, caption: string): Photo[] {
  const trimmed = caption.trim();
  return photos.map((p) =>
    p.id === photoId ? { ...p, caption: trimmed === "" ? null : trimmed } : p,
  );
}
