import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { EmptyState, Icon } from "@luminova/ui";
import { useAbility } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { currentTermKey } from "@luminova/types";
import { useMembers } from "../features/members/hooks/use-members";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useActivityCheckIns } from "../features/check-in/hooks/use-activity-check-ins";
import { useCreateCheckIn } from "../features/check-in/hooks/use-create-check-in";
import { ActivityPicker } from "../features/check-in/components/activity-picker";
import { RosterList } from "../features/check-in/components/roster-list";
import { ManualTapList } from "../features/check-in/components/manual-tap-list";
import { alreadyCheckedIn, buildRosterEntries } from "../features/check-in/roster";
import { decodeMemberQr } from "../lib/member-qr";

const LazyQrScanner = lazy(() =>
  import("@luminova/ui/qr-scanner").then((m) => ({ default: m.QrScanner })),
);

export const Route = createFileRoute("/_app/check-in")({ component: CheckInPage });

function CheckInPage() {
  const ability = useAbility();
  if (!ability.can("checkIn", "Attendance")) {
    return (
      <EmptyState
        icon={Icon.qr({ s: 40 })}
        title="Sin acceso"
        description="El registro de asistencia está disponible para administración y dirección de proyectos."
      />
    );
  }
  return <CheckInBoard />;
}

function CheckInBoard() {
  const termId = currentTermKey();
  const { data: activities } = useActivitiesByTerm(termId);
  const { data: members } = useMembers();
  const [activityId, setActivityId] = useState<string | null>(null);
  const { data: checkIns } = useActivityCheckIns(activityId);
  const create = useCreateCheckIn(activityId ?? "none");

  const roster = useMemo(
    () => buildRosterEntries(checkIns ?? [], members ?? []),
    [checkIns, members],
  );
  const checkedInIds = (checkIns ?? []).map((c) => c.memberId);

  const checkIn = (memberId: string) => {
    if (!activityId) return;
    if (alreadyCheckedIn(checkIns ?? [], memberId)) return; // idempotent: skip re-write
    create.mutate({ memberId, activityId, role: "Attendee" });
  };

  const onScan = (text: string) => {
    const memberId = decodeMemberQr(text);
    if (memberId) checkIn(memberId);
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <PageHeader eyebrow="Reconocimiento" title="Check-in" />
      <ActivityPicker activities={activities ?? []} value={activityId} onChange={setActivityId} />
      {activityId && (
        <>
          <Suspense fallback={<p className="text-ink-3">Cargando cámara…</p>}>
            <LazyQrScanner
              onScan={onScan}
              paused={create.isPending}
              className="aspect-square w-full rounded-[14px] bg-ink-1/5 object-cover"
            />
          </Suspense>
          <RosterList entries={roster} />
          <ManualTapList members={members ?? []} checkedInIds={checkedInIds} onTap={checkIn} />
        </>
      )}
    </div>
  );
}
