export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MAX_EDGE = 512;
export const IMAGE_QUALITY = 0.8;

export type ValidateResult = { ok: true } | { ok: false; reason: "type" | "size" };

export function validateImage(file: File): ValidateResult {
  if (!file.type.startsWith("image/")) return { ok: false, reason: "type" };
  if (file.size > IMAGE_MAX_BYTES) return { ok: false, reason: "size" };
  return { ok: true };
}

export function fittedDimensions(width: number, height: number, maxEdge: number) {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };
  const scale = maxEdge / longEdge;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function cropAndCompress(
  imageSrc: string,
  crop: CropRect,
  maxEdge = IMAGE_MAX_EDGE,
  quality = IMAGE_QUALITY,
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const out = fittedDimensions(crop.width, crop.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, out.width, out.height);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality,
    ),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
