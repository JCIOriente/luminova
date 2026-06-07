import { useEffect, useRef } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { cn } from "../lib/cn";

export interface QrScannerProps {
  onScan: (text: string) => void;
  onError?: (error: unknown) => void;
  className?: string;
  /** Pause decoding (e.g. while a write is in flight) without tearing down the camera. */
  paused?: boolean;
}

/** Live camera QR scanner. Decodes continuously and calls `onScan` with the raw
 *  decoded text. Generic — the caller interprets the payload. */
export function QrScanner({ onScan, onError, className, paused = false }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    let controls: IScannerControls | undefined;
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        if (result && !pausedRef.current) onScan(result.getText());
      })
      .then((c) => {
        if (cancelled) c.stop();
        else controls = c;
      })
      .catch((err) => onError?.(err));

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onScan, onError]);

  return (
    <div className={cn("relative grid place-items-center overflow-hidden bg-jci-black", className)}>
      <video
        ref={videoRef}
        className="size-full object-cover"
        muted
        playsInline
        aria-label="Visor de cámara para escanear códigos QR"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[18%] rounded-[14px] border-2 border-white/90"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[18%] right-[18%] h-0.5 animate-qr-scan bg-jci-teal shadow-[0_0_14px_2px_rgba(87,188,188,0.7)] motion-reduce:hidden"
      />
    </div>
  );
}
