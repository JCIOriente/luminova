import { lazy, Suspense } from "react";
import { Dialog, Icon, RippleSVG, cn } from "@luminova/ui";

const LazyQrScanner = lazy(() =>
  import("@luminova/ui/qr-scanner").then((m) => ({ default: m.QrScanner })),
);

type ScanStatus = "pending" | "success" | "duplicate" | "error";
export interface ScanResult {
  status: ScanStatus;
  title: string;
  name?: string;
}

const SCAN_STYLES: Record<ScanStatus, string> = {
  pending: "bg-ink-1/85",
  success: "bg-emerald-500/95",
  duplicate: "bg-amber-500/95",
  error: "bg-error/95",
};

/** Luma-style overlay over the camera: a single result is shown (and the scanner
 *  paused) until tapped or auto-dismissed, which prevents the same QR from
 *  re-registering. Always dismissable so a hung write can never trap the camera. */
function ScanFeedback({ result, onDismiss }: { result: ScanResult; onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Continuar escaneando"
      className={cn(
        "absolute inset-0 z-10 grid place-items-center rounded-[14px]",
        SCAN_STYLES[result.status],
      )}
    >
      <div className="flex flex-col items-center gap-3 px-6 text-center text-white">
        {result.status === "pending" ? (
          <span className="size-16 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        ) : (
          <span className="grid size-16 place-items-center rounded-full bg-white/20">
            {result.status === "error" ? Icon.close({ s: 44 }) : Icon.check({ s: 44 })}
          </span>
        )}
        <div className="flex flex-col gap-0.5">
          <span className="text-ui-lg font-semibold" aria-live="assertive">
            {result.title}
          </span>
          {result.name && <span className="text-ui-md text-white/85">{result.name}</span>}
          <span className="mt-1 text-ui-xs text-white/70">Toca para continuar</span>
        </div>
      </div>
    </button>
  );
}

interface ScanModalProps {
  presentCount: number;
  paused: boolean;
  scan: ScanResult | null;
  onScan: (text: string) => void;
  onDismissScan: () => void;
  onClose: () => void;
}

const CORNER = "pointer-events-none absolute size-7 border-jci-teal";

const SCAN_OVERLAY = "bg-jci-black/70 backdrop-blur-sm";
const SCAN_CONTENT =
  "max-w-md overflow-hidden bg-jci-black p-0 text-on-dark-1 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)]";

export function ScanModal({
  presentCount,
  paused,
  scan,
  onScan,
  onDismissScan,
  onClose,
}: ScanModalProps) {
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Lector de check-in"
      hideHeader
      overlayClassName={SCAN_OVERLAY}
      contentClassName={SCAN_CONTENT}
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <span className="inline-flex items-center gap-1.5 text-ui-xs font-medium text-on-dark-2">
          <span className="size-2 animate-pulse rounded-full bg-jci-teal" />
          En vivo
        </span>
        <div className="flex items-center gap-3">
          <span className="text-ui-xs text-on-dark-3 tabular-nums">{presentCount} presentes</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-8 place-items-center rounded-full text-on-dark-2 transition-colors hover:bg-white/10 hover:text-on-dark-1"
          >
            {Icon.close({ s: 18 })}
          </button>
        </div>
      </div>

      <div className="px-5 pt-4 pb-5">
        <div className="relative aspect-square w-full overflow-hidden rounded-[14px] bg-black">
          <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-25">
            <RippleSVG rings={5} stroke={4} size={300} color="var(--color-jci-teal)" />
          </div>
          <Suspense
            fallback={
              <p className="grid size-full place-items-center text-on-dark-3">Cargando cámara…</p>
            }
          >
            <LazyQrScanner onScan={onScan} paused={paused} className="size-full object-cover" />
          </Suspense>
          <span className={`${CORNER} top-[16%] left-[16%] border-t-2 border-l-2`} />
          <span className={`${CORNER} top-[16%] right-[16%] border-t-2 border-r-2`} />
          <span className={`${CORNER} bottom-[16%] left-[16%] border-b-2 border-l-2`} />
          <span className={`${CORNER} right-[16%] bottom-[16%] border-r-2 border-b-2`} />
          {scan && <ScanFeedback result={scan} onDismiss={onDismissScan} />}
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-ui-xs text-on-dark-3">
          {Icon.qr({ s: 14 })}
          Apunta la cámara al QR del carnet del miembro
        </p>
      </div>
    </Dialog>
  );
}
