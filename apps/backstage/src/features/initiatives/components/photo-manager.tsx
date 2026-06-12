import { useState } from "react";
import type { Photo } from "@luminova/types";
import { ImageUploader, Input } from "@luminova/ui";

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

  const isDisabled = disabled || busy;

  async function handleSetCover() {
    setBusy(true);
    try {
      await onSetCover(photo.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleSetCaption() {
    setBusy(true);
    try {
      await onSetCaption(photo.id, captionValue);
      setEditingCaption(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      await onRemove(photo.id);
    } finally {
      setBusy(false);
      setConfirmingRemove(false);
    }
  }

  return (
    <figure className="relative">
      <div className="aspect-[3/2] overflow-hidden rounded-card border border-line">
        <img
          src={photo.url}
          alt={photo.caption ?? "Foto"}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>

      {isCover && (
        <span className="absolute top-2 left-2 rounded-pill bg-jci-yellow/22 px-2 py-0.5 text-[12px] font-semibold text-ink-1">
          Portada
        </span>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!isCover && (
          <button
            type="button"
            aria-label="Hacer portada"
            disabled={isDisabled}
            onClick={() => void handleSetCover()}
            className="min-h-11 min-w-11 rounded-[8px] px-2 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue disabled:cursor-not-allowed disabled:opacity-50"
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
                if (e.key === "Enter") void handleSetCaption();
                if (e.key === "Escape") setEditingCaption(false);
              }}
              onBlur={() => void handleSetCaption()}
              className="h-9 text-[13px]"
            />
          </div>
        ) : (
          <button
            type="button"
            aria-label="Editar descripción"
            disabled={isDisabled}
            onClick={() => setEditingCaption(true)}
            className="min-h-11 min-w-11 rounded-[8px] px-2 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            {photo.caption ? "Editar pie" : "Añadir pie"}
          </button>
        )}

        {confirmingRemove ? (
          <span className="flex items-center gap-1.5 text-[13px]">
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
            className="min-h-11 min-w-11 ml-auto rounded-[8px] px-2 text-[13px] font-medium text-error transition-colors hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue disabled:cursor-not-allowed disabled:opacity-50"
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
