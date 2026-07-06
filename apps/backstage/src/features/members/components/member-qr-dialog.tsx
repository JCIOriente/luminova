import { lazy, Suspense } from "react";
import { Dialog } from "@luminova/ui";

// qrcode.react (~13 kB gz) stays in its own lazy chunk.
const QrCode = lazy(() => import("@luminova/ui/qr-code").then((m) => ({ default: m.QrCode })));

export function MemberQrDialog({
  open,
  onOpenChange,
  value,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  name: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Tu QR de check-in"
      description="Muéstralo en el check-in para registrar tu asistencia."
    >
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-[16px] border border-line bg-jci-white p-5">
          <Suspense fallback={<div className="size-[320px]" />}>
            <QrCode value={value} size={320} />
          </Suspense>
        </div>
        <p className="text-ui-sm font-medium text-ink-2">{name}</p>
      </div>
    </Dialog>
  );
}
