import type { ShowcaseItem } from "@luminova/types/engine";

export function PhotoGallery({
  photos,
  title,
}: {
  photos: ShowcaseItem["photos"];
  title?: string;
}) {
  if (photos.length === 0) return null;

  return (
    <figure className="gallery">
      <ul className="gallery-grid">
        {photos.map((photo) => (
          <li key={photo.id} className="gallery-item">
            <img src={photo.url} alt={photo.caption ?? title ?? ""} loading="lazy" />
            {photo.caption && <span className="gallery-caption">{photo.caption}</span>}
          </li>
        ))}
      </ul>
    </figure>
  );
}
