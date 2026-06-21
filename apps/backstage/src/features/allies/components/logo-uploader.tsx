import { useState, type ChangeEvent } from "react";
import { Input } from "@luminova/ui";

const ACCEPTED = ["image/png", "image/jpeg"];
const MAX_BYTES = 2 * 1024 * 1024;

interface LogoUploaderProps {
  currentSrc: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
}

export function LogoUploader({ currentSrc, onUpload, onRemove, disabled }: LogoUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("Usa una imagen PNG o JPEG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("El logo supera 2 MB.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onUpload(file);
    } catch {
      setError("No se pudo subir el logo. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-ink-1">Logo</span>
      {currentSrc && (
        <img
          src={currentSrc}
          alt="Logo actual"
          className="h-16 w-auto rounded-card border border-line object-contain p-1"
        />
      )}
      <Input
        type="file"
        aria-label="Logo"
        accept="image/png,image/jpeg"
        disabled={disabled || busy}
        onChange={(e) => void onFile(e)}
        className="h-auto py-2 text-[13px]"
      />
      {currentSrc && (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void onRemove()}
          className="self-start text-[13px] font-medium text-error transition-colors hover:opacity-80 disabled:opacity-50"
        >
          Quitar logo
        </button>
      )}
      {error && (
        <div role="alert" className="text-[13px] text-error">
          {error}
        </div>
      )}
    </div>
  );
}
