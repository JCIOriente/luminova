import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { EmptyState, Toast, Icon } from "@luminova/ui";
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

  const checkIn = (memberId: string) => {
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
    const memberId = decodeMemberQr(text);
    if (memberId) checkIn(memberId);
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
      <Suspense fallback={<p className="text-ink-3">Cargando cámara…</p>}>
        <LazyQrScanner
          onScan={onScan}
          paused={create.isPending}
          className="aspect-square w-full rounded-[14px] bg-ink-1/5 object-cover"
        />
      </Suspense>
      <RosterList entries={roster} />
      {members.length > 0 && (
        <ManualTapList members={members} checkedInIds={checkedInIds} onTap={checkIn} />
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
