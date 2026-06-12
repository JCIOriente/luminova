import type { Photo } from "@luminova/types";
import { Badge, EmptyState } from "@luminova/ui";

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
            <Badge tone="amber" className="absolute top-2 left-2">
              Portada
            </Badge>
          )}
          {photo.caption && (
            <figcaption className="mt-1 text-[13px] text-ink-2">{photo.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
