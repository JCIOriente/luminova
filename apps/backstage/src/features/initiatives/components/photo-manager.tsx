import { useRef, useState } from "react";
import type { Photo } from "@luminova/types";
import { Badge, Card, ImageUploader, Input } from "@luminova/ui";

interface PhotoManagerProps {
  photos: Photo[];
  onUpload: (blob: Blob) => Promise<void>;
  onRemove: (photoId: string) => Promise<void>;
  onSetCover: (photoId: string) => Promise<void>;
  onSetCaption: (photoId: string, caption: string) => Promise<void>;
  disabled?: boolean;
}

interface ThumbnailProps {
  photo: Photo;
  isCover: boolean;
  onSetCover: (photoId: string) => Promise<void>;
  onRemove: (photoId: string) => Promise<void>;
  onSetCaption: (photoId: string, caption: string) => Promise<void>;
  disabled?: boolean;
}

function PhotoThumbnail({
  photo,
  isCover,
  onSetCover,
  onRemove,
  onSetCaption,
  disabled,
}: ThumbnailProps) {
  const [busy, setBusy] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionValue, setCaptionValue] = useState(photo.caption ?? "");
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const committingRef = useRef(false);

  const isDisabled = disabled || busy;

  // The action callbacks reject on a failed write; the consumer surfaces the error
  // toast, and we swallow here so `void handler()` doesn't leave an unhandled rejection.
  // Crucially, the success-only UI transitions (close editor / close confirm) run inside
  // `try` AFTER the await, so a rejection leaves the editor/confirm open for a retry.
  async function handleSetCover() {
    setBusy(true);
    try {
      await onSetCover(photo.id);
    } catch {
      /* toast surfaced by caller; nothing to keep open here */
    } finally {
      setBusy(false);
    }
  }

  async function commitCaption() {
    if (committingRef.current) return;
    committingRef.current = true;
    setBusy(true);
    try {
      await onSetCaption(photo.id, captionValue);
      setEditingCaption(false);
    } catch {
      /* keep the editor open with the typed value so the user can retry */
    } finally {
      setBusy(false);
      committingRef.current = false;
    }
  }

  function cancelCaption() {
    committingRef.current = true;
    setCaptionValue(photo.caption ?? "");
    setEditingCaption(false);
    queueMicrotask(() => {
      committingRef.current = false;
    });
  }

  async function handleRemove() {
    setBusy(true);
    try {
      await onRemove(photo.id);
      setConfirmingRemove(false);
    } catch {
      /* keep the confirm open so the failed removal can be retried */
    } finally {
      setBusy(false);
    }
  }

  return (
    <figure className="relative">
      <Card padding="none" className="aspect-[3/2] overflow-hidden">
        <img
          src={photo.url}
          alt={photo.caption ?? "Foto"}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </Card>

      {isCover && (
        <Badge tone="amber" className="absolute top-2 left-2">
          Portada
        </Badge>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!isCover && (
          <button
            type="button"
            aria-label="Hacer portada"
            disabled={isDisabled}
            onClick={() => void handleSetCover()}
            className="min-h-11 min-w-11 rounded-[8px] px-2 text-ui-sm font-medium text-ink-2 transition-colors hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            Hacer portada
          </button>
        )}

        {editingCaption ? (
          <div className="flex flex-1 items-center gap-2">
            <Input
              aria-label="Editar descripción"
              value={captionValue}
              disabled={isDisabled}
              onChange={(e) => setCaptionValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitCaption();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelCaption();
                }
              }}
              onBlur={() => {
                if (!committingRef.current) void commitCaption();
              }}
              className="h-9 text-ui-sm"
            />
          </div>
        ) : (
          <button
            type="button"
            aria-label="Editar descripción"
            disabled={isDisabled}
            onClick={() => setEditingCaption(true)}
            className="min-h-11 min-w-11 rounded-[8px] px-2 text-ui-sm font-medium text-ink-2 transition-colors hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            {photo.caption ? "Editar pie" : "Añadir pie"}
          </button>
        )}

        {confirmingRemove ? (
          <span className="flex items-center gap-1.5 text-ui-sm">
            <span className="text-ink-2">¿Quitar?</span>
            <button
              type="button"
              aria-label="Confirmar quitar foto"
              disabled={isDisabled}
              onClick={() => void handleRemove()}
              className="min-h-11 min-w-11 px-1 font-semibold text-error transition-colors hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue disabled:opacity-50"
            >
              Sí
            </button>
            <button
              type="button"
              aria-label="Cancelar quitar foto"
              disabled={isDisabled}
              onClick={() => setConfirmingRemove(false)}
              className="min-h-11 min-w-11 px-1 font-medium text-ink-2 transition-colors hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue disabled:opacity-50"
            >
              No
            </button>
          </span>
        ) : (
          <button
            type="button"
            aria-label="Quitar foto"
            disabled={isDisabled}
            onClick={() => setConfirmingRemove(true)}
            className="min-h-11 min-w-11 ml-auto rounded-[8px] px-2 text-ui-sm font-medium text-error transition-colors hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            Quitar
          </button>
        )}
      </div>
    </figure>
  );
}

export function PhotoManager({
  photos,
  onUpload,
  onRemove,
  onSetCover,
  onSetCaption,
  disabled,
}: PhotoManagerProps) {
  return (
    <div className="flex flex-col gap-6">
      <ImageUploader
        currentSrc={null}
        name="Foto"
        aspect={3 / 2}
        cropShape="rect"
        maxEdge={1600}
        onUpload={onUpload}
        onRemove={async () => {}}
        disabled={disabled}
      />

      {photos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo, index) => (
            <PhotoThumbnail
              key={photo.id}
              photo={photo}
              isCover={index === 0}
              onSetCover={onSetCover}
              onRemove={onRemove}
              onSetCaption={onSetCaption}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
