import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, Toast, Icon } from "@luminova/ui";
import type { Member } from "@luminova/types";
import { useActivityCheckIns } from "../hooks/use-activity-check-ins";
import { useCreateCheckIn } from "../hooks/use-create-check-in";
import { RosterList } from "./roster-list";
import { ManualTapList } from "./manual-tap-list";
import { ScanModal, type ScanResult } from "./scan-modal";
import { alreadyCheckedIn, buildRosterEntries } from "../roster";
import { decodeMemberQr } from "../../../lib/member-qr";

interface ActivityCheckInProps {
  activityId: string;
  members: Member[];
  open?: boolean;
}

export function ActivityCheckIn({ activityId, members, open = true }: ActivityCheckInProps) {
  const { data: checkIns } = useActivityCheckIns(activityId);
  const create = useCreateCheckIn(activityId);

  const roster = useMemo(() => buildRosterEntries(checkIns ?? [], members), [checkIns, members]);
  const checkedInIds = useMemo(() => (checkIns ?? []).map((c) => c.memberId), [checkIns]);

  const [scanOpen, setScanOpen] = useState(false);
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
      <div className="flex items-center justify-between gap-4 rounded-card border border-line bg-surface px-5 py-4">
        <div className="flex flex-col">
          <span className="text-[34px] leading-none font-semibold tabular-nums text-ink-1">
            {roster.length}
          </span>
          <span className="mt-1 text-[12px] text-ink-3">
            {roster.length === 1 ? "miembro presente" : "miembros presentes"}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-ok/10 px-3 py-1.5 text-[12px] font-medium text-ok">
          {Icon.check({ s: 15 })}
          {roster.length} registrados
        </span>
      </div>

      <button
        type="button"
        onClick={() => setScanOpen(true)}
        className="flex items-center gap-4 rounded-card border border-line bg-surface px-5 py-4 text-left transition-colors hover:border-jci-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-card bg-jci-blue/10 text-jci-blue">
          {Icon.qr({ s: 22 })}
        </span>
        <span className="flex flex-1 flex-col">
          <span className="text-[14px] font-semibold text-ink-1">Escanear carnets</span>
          <span className="text-[12.5px] text-ink-3">Abre el lector de QR</span>
        </span>
        <span className="text-ink-4">{Icon.arrowRight({ s: 18 })}</span>
      </button>

      <RosterList entries={roster} />
      {members.length > 0 && (
        <ManualTapList members={members} checkedInIds={checkedInIds} onTap={onManualTap} />
      )}

      {scanOpen && (
        <ScanModal
          presentCount={roster.length}
          paused={create.isPending || scan !== null}
          scan={scan}
          onScan={onScan}
          onDismissScan={dismissScan}
          onClose={() => {
            setScanOpen(false);
            dismissScan();
          }}
        />
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
