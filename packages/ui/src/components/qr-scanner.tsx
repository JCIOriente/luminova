import { useEffect, useRef } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

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
    <video
      ref={videoRef}
      className={className}
      muted
      playsInline
      aria-label="Visor de cámara para escanear códigos QR"
    />
  );
}
