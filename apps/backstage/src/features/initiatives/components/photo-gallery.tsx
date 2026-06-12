import type { Photo } from "@luminova/types";
import { EmptyState } from "@luminova/ui";

interface PhotoGalleryProps {
  photos: Photo[];
  showCover?: boolean;
}

export function PhotoGallery({ photos, showCover = false }: PhotoGalleryProps) {
  if (photos.length === 0) {
    return <EmptyState title="Sin fotos todavía" />;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {photos.map((photo, index) => (
        <figure key={photo.id} className="relative">
          <div className="aspect-[3/2] overflow-hidden rounded-card border border-line">
            <img
              src={photo.url}
              alt={photo.caption ?? "Foto"}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
          {showCover && index === 0 && (
            <span className="absolute top-2 left-2 rounded-pill bg-jci-yellow/22 px-2 py-0.5 text-[12px] font-semibold text-ink-1">
              Portada
            </span>
          )}
          {photo.caption && (
            <figcaption className="mt-1 text-[13px] text-ink-2">{photo.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
