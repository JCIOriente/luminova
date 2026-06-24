import { useMemo } from "react";
import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import type { ShowcaseItem } from "@luminova/types/engine";

export default function PhotoLightbox({
  photos,
  open,
  index,
  onClose,
}: {
  photos: ShowcaseItem["photos"];
  open: boolean;
  index: number;
  onClose: () => void;
}) {
  const slides = useMemo(
    () => photos.map((photo) => ({ src: photo.url, description: photo.caption ?? undefined })),
    [photos],
  );
  return (
    <Lightbox
      open={open}
      index={index}
      close={onClose}
      slides={slides}
      plugins={[Captions, Fullscreen, Thumbnails, Zoom]}
    />
  );
}
