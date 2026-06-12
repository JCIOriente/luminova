import { lazy, Suspense, useMemo } from "react";
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
}

export function ActivityCheckIn({ activityId, members }: ActivityCheckInProps) {
  const { data: checkIns } = useActivityCheckIns(activityId);
  const create = useCreateCheckIn(activityId);

  const roster = useMemo(() => buildRosterEntries(checkIns ?? [], members), [checkIns, members]);
  const checkedInIds = useMemo(() => (checkIns ?? []).map((c) => c.memberId), [checkIns]);

  const checkIn = (memberId: string) => {
    if (alreadyCheckedIn(checkIns ?? [], memberId)) return;
    create.mutate({ memberId, activityId, role: "Attendee" });
  };

  const onScan = (text: string) => {
    const memberId = decodeMemberQr(text);
    if (memberId) checkIn(memberId);
  };

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
    </div>
  );
}
