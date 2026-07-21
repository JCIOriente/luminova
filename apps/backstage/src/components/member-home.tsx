import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Card, Icon } from "@luminova/ui";
import { PageHeader } from "./page-header";
import { WidgetHeader } from "./widget-header";
import { QueryErrorState } from "./query-error-state";
import { currentTermKey, positionTitle } from "@luminova/types";
import { encodeMemberQr } from "../lib/member-qr";
import { pointsRank } from "../lib/points-rank";
import { useCurrentMember } from "../features/members/hooks/use-current-member";
import { useMembers } from "../features/members/hooks/use-members";
import { useMemberPoints } from "../features/members/hooks/use-member-points";
import { useMemberParticipations } from "../features/members/hooks/use-member-participations";
import { useMemberPointsByTerm } from "../features/members/hooks/use-member-points-by-term";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useInitiativesByTerm } from "../features/initiatives/hooks/use-initiatives-by-term";
import { usePositions } from "../features/positions/hooks/use-positions";
import { joinYear } from "../features/members/lib/member-display";
import { summarizeParticipations } from "../features/members/lib/participation-summary";
import { MemberPointsSummary } from "../features/members/components/member-points-summary";
import { MemberCredentialCard } from "../features/members/components/member-credential-card";
import { MemberMilestones } from "../features/members/components/member-milestones";
import { MemberUpcomingEvents } from "../features/members/components/member-upcoming-events";
import { ParticipationLedger } from "../features/members/components/participation-ledger";
import { SelfProfileForm } from "../features/members/components/self-profile-form";
import { useCan } from "../lib/authz/use-can";

// qrcode.react (~13 kB gz) lazy so it leaves the always-loaded index shell.
const QrCode = lazy(() => import("@luminova/ui/qr-code").then((m) => ({ default: m.QrCode })));

// The modal stays code-split out of the always-loaded /me shell, but we warm
// its chunk at idle (below) so the first open is instant instead of stalling
// on a cold fetch — otherwise the dialog animates in a beat after the tap.
const importQrDialog = () => import("../features/members/components/member-qr-dialog");
const MemberQrDialog = lazy(() => importQrDialog().then((m) => ({ default: m.MemberQrDialog })));

export function MemberHome() {
  const termId = currentTermKey();
  const gate = useCan();
  const { data: member, isLoading, isError, error, refetch } = useCurrentMember();
  const memberId = member?.id ?? "";
  const { data: points } = useMemberPoints(memberId, termId);
  const { data: participations } = useMemberParticipations(memberId, termId);
  const { data: allPoints } = useMemberPointsByTerm(termId);
  const activitiesQuery = useActivitiesByTerm(termId);
  const activities = activitiesQuery.data;
  const membersQuery = useMembers();
  const { data: initiatives } = useInitiativesByTerm(termId, {
    includePrograms: true,
    includeProjects: true,
  });
  const { data: positions } = usePositions();
  const [qrOpen, setQrOpen] = useState(false);
  const now = new Date();

  useEffect(() => {
    const idle = window.requestIdleCallback;
    const warm = () => void importQrDialog();
    if (idle) {
      const id = idle(warm);
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(warm, 200);
    return () => window.clearTimeout(id);
  }, []);

  const summary = useMemo(
    () => summarizeParticipations(participations ?? [], activities ?? [], initiatives ?? []),
    [participations, activities, initiatives],
  );

  const rank = useMemo(
    () => (allPoints && member ? pointsRank(allPoints, member.id) : null),
    [allPoints, member],
  );

  const positionsById = useMemo(
    () => new Map((positions ?? []).map((p) => [p.id, p])),
    [positions],
  );

  if (isLoading) return <p className="text-ink-3">Cargando…</p>;
  if (isError) return <QueryErrorState error={error} onRetry={() => refetch()} />;
  if (!member) {
    return <p className="text-ink-2">Tu usuario no está vinculado a un perfil de miembro.</p>;
  }

  // Per-document probe: this is the ONE place the own-doc grant is the right question.
  const canEditSelf = gate.can("update", "Member", { uid: member.uid });

  const cargoId = member.positions?.[termId]?.cargoId ?? null;
  const cargo = cargoId ? positionsById.get(cargoId) : null;
  const role = cargo ? positionTitle(cargo, member.gender) : "Miembro";
  const memberJoinYear = member.joinDate ? joinYear(member.joinDate) : null;
  const qrValue = encodeMemberQr(member.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Mi panel" title={member.name} />

      <MemberPointsSummary
        points={points}
        termId={termId}
        rank={rank}
        activityCount={summary.activityCount}
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-stretch">
        <MemberCredentialCard
          memberId={member.id}
          name={member.name}
          src={member.profilePicture}
          joinYear={memberJoinYear}
          role={role}
        />
        <Card as="section" padding="none" className="flex flex-col">
          <WidgetHeader title="Check-in" subtitle="Acceso a eventos" icon={Icon.qr({ s: 20 })} />
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            aria-label="Ampliar el código QR"
            className="group flex flex-1 cursor-pointer flex-col items-center justify-center gap-4 px-6 py-6 text-center transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
          >
            <div className="rounded-[14px] border border-line bg-jci-white p-3.5 transition group-hover:border-jci-blue group-focus-visible:border-jci-blue">
              <Suspense fallback={<div className="size-[168px]" />}>
                <QrCode value={qrValue} size={168} />
              </Suspense>
            </div>
            <p className="max-w-[220px] text-ui-xs leading-relaxed text-ink-3">
              <span className="font-semibold text-ink-2">Tu QR personal.</span> Muéstralo en el
              check-in. <span className="font-semibold text-jci-blue">Toca para ampliar.</span>
            </p>
          </button>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <MemberUpcomingEvents
          activities={activities}
          isLoading={activitiesQuery.isLoading}
          isError={activitiesQuery.isError}
          error={activitiesQuery.error}
          onRetry={() => activitiesQuery.refetch()}
          now={now}
        />
        <MemberMilestones
          member={member}
          members={membersQuery.data}
          membersLoading={membersQuery.isLoading}
          membersError={membersQuery.isError}
          membersErrorValue={membersQuery.error}
          onRetryMembers={() => membersQuery.refetch()}
          now={now}
        />
      </div>

      <ParticipationLedger
        summary={summary}
        totalPoints={points?.cumulative ?? 0}
        termId={termId}
      />

      {canEditSelf && (
        <Card as="section" padding="none" className="flex flex-col">
          <WidgetHeader
            title="Mi perfil"
            subtitle="Datos que administras tú"
            icon={Icon.user({ s: 20 })}
          />
          <div className="px-6 py-5">
            <SelfProfileForm member={member} />
          </div>
        </Card>
      )}

      {qrOpen && (
        <Suspense fallback={null}>
          <MemberQrDialog open onOpenChange={setQrOpen} value={qrValue} name={member.name} />
        </Suspense>
      )}
    </div>
  );
}
