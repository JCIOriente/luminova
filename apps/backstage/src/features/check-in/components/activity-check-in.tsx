import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, Toast, Icon, cn } from "@luminova/ui";
import type { Member } from "@luminova/types";
import { useActivityCheckIns } from "../hooks/use-activity-check-ins";
import { useCreateCheckIn } from "../hooks/use-create-check-in";
import { RosterList } from "./roster-list";
import { ManualTapList } from "./manual-tap-list";
import { alreadyCheckedIn, buildRosterEntries } from "../roster";
import { decodeMemberQr } from "../../../lib/member-qr";

const LazyQrScanner = lazy(() =>
  import("@luminova/ui/qr-scanner").then((m) => ({ default: m.QrScanner })),
);

interface ActivityCheckInProps {
  activityId: string;
  members: Member[];
  open?: boolean;
}

type ScanStatus = "pending" | "success" | "duplicate" | "error";
interface ScanResult {
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
          <span className="text-[17px] font-semibold" aria-live="assertive">
            {result.title}
          </span>
          {result.name && <span className="text-[14px] text-white/85">{result.name}</span>}
          <span className="mt-1 text-[12px] text-white/70">Toca para continuar</span>
        </div>
      </div>
    </button>
  );
}

export function ActivityCheckIn({ activityId, members, open = true }: ActivityCheckInProps) {
  const { data: checkIns } = useActivityCheckIns(activityId);
  const create = useCreateCheckIn(activityId);

  const roster = useMemo(() => buildRosterEntries(checkIns ?? [], members), [checkIns, members]);
  const checkedInIds = useMemo(() => (checkIns ?? []).map((c) => c.memberId), [checkIns]);

  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const [scan, setScan] = useState<ScanResult | null>(null);
  // Bumped on every dismiss so a late mutation callback can't re-open a stale
  // overlay after the operator has moved on.
  const scanTokenRef = useRef(0);
  const dismissScan = () => {
    scanTokenRef.current += 1;
    setScan(null);
  };

  // Auto-clear a settled result after a beat (the scanner stays paused until then,
  // so the same QR is never read twice). A "pending" write waits for its callback.
  useEffect(() => {
    if (!scan || scan.status === "pending") return;
    const t = setTimeout(() => setScan(null), 2800);
    return () => clearTimeout(t);
  }, [scan]);

  const onManualTap = (memberId: string) => {
    if (alreadyCheckedIn(checkIns ?? [], memberId)) return;
    create.mutate(
      { memberId, activityId, role: "Attendee" },
      {
        onSuccess: () => setToast({ message: "Asistencia registrada", ok: true }),
        onError: () => setToast({ message: "No se pudo registrar la asistencia", ok: false }),
      },
    );
  };

  const onScan = (text: string) => {
    // Gate while a result is shown. QrScanner calls the latest onScan (via a ref),
    // so this reads the current `scan`; do not memoize onScan or it would go stale.
    if (scan) return;
    const memberId = decodeMemberQr(text);
    if (!memberId) {
      setScan({ status: "error", title: "Código no reconocido" });
      return;
    }
    const name = members.find((m) => m.id === memberId)?.name;
    if (alreadyCheckedIn(checkIns ?? [], memberId)) {
      setScan({ status: "duplicate", title: "Ya tiene asistencia", name });
      return;
    }
    const token = (scanTokenRef.current += 1);
    setScan({ status: "pending", title: "Registrando…", name });
    create.mutate(
      { memberId, activityId, role: "Attendee" },
      {
        onSuccess: () => {
          if (scanTokenRef.current === token)
            setScan({ status: "success", title: "Asistencia registrada", name });
        },
        onError: () => {
          if (scanTokenRef.current === token)
            setScan({ status: "error", title: "No se pudo registrar la asistencia", name });
        },
      },
    );
  };

  if (!open) {
    return (
      <EmptyState
        icon={Icon.calendar({ s: 40 })}
        title="Check-in no disponible"
        description="Solo se puede registrar asistencia el día de la actividad y mientras su iniciativa siga abierta."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <div className="relative aspect-square w-full">
        <Suspense fallback={<p className="text-ink-3">Cargando cámara…</p>}>
          <LazyQrScanner
            onScan={onScan}
            paused={create.isPending || scan !== null}
            className="size-full rounded-[14px] bg-ink-1/5 object-cover"
          />
        </Suspense>
        {scan && <ScanFeedback result={scan} onDismiss={dismissScan} />}
      </div>
      <RosterList entries={roster} />
      {members.length > 0 && (
        <ManualTapList members={members} checkedInIds={checkedInIds} onTap={onManualTap} />
      )}
      {toast && (
        <Toast
          message={toast.message}
          icon={toast.ok ? Icon.check({ s: 18 }) : Icon.close({ s: 18 })}
        />
      )}
    </div>
  );
}
