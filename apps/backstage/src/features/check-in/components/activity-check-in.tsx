import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, Toast, Icon } from "@luminova/ui";
import type { Member } from "@luminova/types";
import { useActivityCheckIns } from "../hooks/use-activity-check-ins";
import { useCreateCheckIn } from "../hooks/use-create-check-in";
import { useRemoveCheckIn } from "../hooks/use-remove-check-in";
import { CheckInStats } from "./check-in-stats";
import { PresentTable } from "./present-table";
import { ManualTapList } from "./manual-tap-list";
import { ScanModal, type ScanResult } from "./scan-modal";
import { alreadyCheckedIn, buildRosterEntries, type RosterEntry } from "../roster";
import { computeAttendance } from "../lib/attendance";
import { canRemoveEntry } from "../lib/can-remove-entry";
import { decodeMemberQr } from "../../../lib/member-qr";
import { useAbility } from "../../../lib/authz/ability-context";

interface ActivityCheckInProps {
  activityId: string;
  members: Member[];
  open?: boolean;
}

/** How long a toast / settled scan result lingers before auto-clearing. */
const DISMISS_MS = 2800;

export function ActivityCheckIn({ activityId, members, open = true }: ActivityCheckInProps) {
  const { data: checkIns } = useActivityCheckIns(activityId);
  const create = useCreateCheckIn(activityId);
  const remove = useRemoveCheckIn(activityId);
  const ability = useAbility();

  const roster = useMemo(() => buildRosterEntries(checkIns ?? [], members), [checkIns, members]);
  const checkedInIds = useMemo(() => (checkIns ?? []).map((c) => c.memberId), [checkIns]);
  const attendance = computeAttendance(roster.length);

  const [scanOpen, setScanOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), DISMISS_MS);
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
    const t = setTimeout(() => setScan(null), DISMISS_MS);
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

  const onRemove = (entry: RosterEntry) => {
    if (remove.isPending) return;
    remove.mutate(
      { memberId: entry.memberId, role: entry.role },
      {
        onSuccess: () => setToast({ message: "Asistencia eliminada", ok: true }),
        onError: () => setToast({ message: "No se pudo eliminar la asistencia", ok: false }),
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
    <div className="flex flex-col gap-5">
      <CheckInStats attendance={attendance} />

      <div className="grid items-start gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          className="flex items-center gap-4 rounded-card bg-jci-blue px-5 py-4 text-left text-on-dark-1 transition-colors hover:bg-jci-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-card bg-white/15">
            {Icon.qr({ s: 22 })}
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-[15px] font-semibold">Escanear carnets</span>
            <span className="text-[12.5px] text-on-dark-2">Abre el lector de QR</span>
          </span>
          <span aria-hidden="true">{Icon.arrowRight({ s: 18 })}</span>
        </button>

        {members.length > 0 && (
          <ManualTapList members={members} checkedInIds={checkedInIds} onTap={onManualTap} />
        )}
      </div>

      <PresentTable
        entries={roster}
        onRemove={onRemove}
        canRemove={(entry) => canRemoveEntry(ability, activityId, entry)}
      />

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
