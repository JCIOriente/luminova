import { useMemo, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import type { ShowcaseItem } from "@luminova/types/engine";

export function PhotoGallery({
  photos,
  title,
}: {
  photos: ShowcaseItem["photos"];
  title?: string;
}) {
  const [index, setIndex] = useState(-1);
  const slides = useMemo(
    () => photos.map((photo) => ({ src: photo.url, description: photo.caption ?? undefined })),
    [photos],
  );

  if (photos.length === 0) return null;

  return (
    <figure className="gallery">
      <ul className="gallery-grid">
        {photos.map((photo, i) => (
          <li key={photo.id} className="gallery-item">
            <button
              type="button"
              className="gallery-trigger"
              onClick={() => setIndex(i)}
              aria-label={photo.caption ?? title ?? "Ampliar foto"}
            >
              <img src={photo.url} alt="" loading="lazy" />
              {photo.caption && <span className="gallery-caption">{photo.caption}</span>}
            </button>
          </li>
        ))}
      </ul>
      <Lightbox
        open={index >= 0}
        index={index < 0 ? 0 : index}
        close={() => setIndex(-1)}
        slides={slides}
        plugins={[Captions, Fullscreen, Thumbnails, Zoom]}
      />
    </figure>
  );
}
