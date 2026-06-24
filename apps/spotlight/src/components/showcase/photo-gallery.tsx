import { lazy, Suspense, useState } from "react";
import type { ShowcaseItem } from "@luminova/types/engine";

const PhotoLightbox = lazy(() => import("./photo-lightbox"));

export function PhotoGallery({
  photos,
  title,
}: {
  photos: ShowcaseItem["photos"];
  title?: string;
}) {
  const [index, setIndex] = useState(-1);
  const [ready, setReady] = useState(false);

  if (photos.length === 0) return null;

  return (
    <figure className="gallery">
      <ul className="gallery-grid">
        {photos.map((photo, i) => (
          <li key={photo.id} className="gallery-item">
            <button
              type="button"
              className="gallery-trigger"
              onClick={() => {
                setReady(true);
                setIndex(i);
              }}
              aria-label={photo.caption ?? title ?? "Ampliar foto"}
            >
              <img src={photo.url} alt="" loading="lazy" decoding="async" />
              {photo.caption && <span className="gallery-caption">{photo.caption}</span>}
            </button>
          </li>
        ))}
      </ul>
      {ready && (
        <Suspense fallback={null}>
          <PhotoLightbox
            photos={photos}
            open={index >= 0}
            index={index < 0 ? 0 : index}
            onClose={() => setIndex(-1)}
          />
        </Suspense>
      )}
    </figure>
  );
}
