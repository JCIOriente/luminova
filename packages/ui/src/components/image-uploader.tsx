import { lazy, Suspense, useEffect, useState, type ChangeEvent } from "react";
import type { Area } from "react-easy-crop";
import { Avatar } from "./avatar";
import { validateImage, cropAndCompress } from "../lib/image";
import { cn } from "../lib/cn";

const Cropper = lazy(() => import("react-easy-crop"));

interface ImageUploaderProps {
  currentSrc: string | null | undefined;
  name: string;
  onUpload: (blob: Blob) => Promise<void>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
  aspect?: number;
  cropShape?: "round" | "rect";
  maxEdge?: number;
}

const actionLink = "text-[14px] font-semibold text-jci-blue transition-colors hover:text-jci-navy";

export function ImageUploader({
  currentSrc,
  name,
  onUpload,
  onRemove,
  disabled,
  aspect = 1,
  cropShape = "round",
  maxEdge = 512,
}: ImageUploaderProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revoke the object URL when it is replaced (re-pick) or the component unmounts
  // (e.g. drawer closed mid-crop) — otherwise the blob leaks for the page's lifetime.
  useEffect(() => {
    if (!src) return;
    return () => URL.revokeObjectURL(src);
  }, [src]);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const result = validateImage(file);
    if (!result.ok) {
      setError(
        result.reason === "type" ? "Selecciona una imagen válida." : "La imagen supera 5 MB.",
      );
      return;
    }
    setError(null);
    setSrc(URL.createObjectURL(file));
  }

  function discard() {
    setSrc(null);
    setAreaPixels(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }

  async function confirmCrop() {
    if (!src || !areaPixels) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await cropAndCompress(src, areaPixels, maxEdge);
      await onUpload(blob);
      discard();
    } catch {
      setError("No se pudo subir la imagen. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await onRemove();
    } catch {
      setError("No se pudo quitar la imagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar src={currentSrc} name={name} size={64} />
        {/* `relative` contains the sr-only file input — see checkbox.tsx: an
            absolutely-positioned sr-only control with no positioned ancestor
            decouples from a nested scroll container and scroll-jumps on focus. */}
        <label
          className={cn(
            "relative",
            actionLink,
            "cursor-pointer",
            (disabled || busy) && "opacity-50",
          )}
        >
          {currentSrc ? "Cambiar foto" : "Subir foto"}
          <input
            data-testid="image-file-input"
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={disabled || busy}
            onChange={onFile}
          />
        </label>
        {currentSrc ? (
          <button
            type="button"
            onClick={remove}
            disabled={disabled || busy}
            className="text-[14px] font-semibold text-error transition-colors hover:opacity-80 disabled:opacity-50"
          >
            Quitar
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-error">
          {error}
        </p>
      ) : null}

      {src ? (
        <div className="flex flex-col gap-2">
          <div className="relative h-64 w-full overflow-hidden rounded-card bg-jci-black/80">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-on-dark-3">
                  Cargando editor…
                </div>
              }
            >
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                cropShape={cropShape}
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setAreaPixels(pixels)}
              />
            </Suspense>
          </div>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={confirmCrop}
              disabled={busy}
              className={cn(actionLink, "disabled:opacity-50")}
            >
              {busy ? "Subiendo…" : "Guardar foto"}
            </button>
            <button
              type="button"
              onClick={discard}
              disabled={busy}
              className="text-[14px] font-medium text-ink-2 transition-colors hover:text-ink-1 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
