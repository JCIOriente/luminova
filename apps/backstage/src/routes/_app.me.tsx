import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { Card, Icon } from "@luminova/ui";
import { PageHeader } from "../components/page-header";
import { QueryErrorState } from "../components/query-error-state";
import { currentTermKey, positionTitle } from "@luminova/types";
import { encodeMemberQr } from "../lib/member-qr";
import { pointsRank } from "../lib/points-rank";
import { useCurrentMember } from "../features/members/hooks/use-current-member";
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
import { ParticipationLedger } from "../features/members/components/participation-ledger";

// qrcode.react (~13 kB gz) lazy so it leaves the always-loaded index shell.
const QrCode = lazy(() => import("@luminova/ui/qr-code").then((m) => ({ default: m.QrCode })));

// The modal pulls in Radix Dialog — lazy-mount it on demand so it stays out of
// the always-loaded /me shell.
const MemberQrDialog = lazy(() =>
  import("../features/members/components/member-qr-dialog").then((m) => ({
    default: m.MemberQrDialog,
  })),
);

export const Route = createFileRoute("/_app/me")({ component: MemberHome });

export function MemberHome() {
  const termId = currentTermKey();
  const { data: member, isLoading, isError, error, refetch } = useCurrentMember();
  const memberId = member?.id ?? "";
  const { data: points } = useMemberPoints(memberId, termId);
  const { data: participations } = useMemberParticipations(memberId, termId);
  const { data: allPoints } = useMemberPointsByTerm(termId);
  const { data: activities } = useActivitiesByTerm(termId);
  const { data: initiatives } = useInitiativesByTerm(termId, {
    includePrograms: true,
    includeProjects: true,
  });
  const { data: positions } = usePositions();
  const [qrOpen, setQrOpen] = useState(false);

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
          <header className="flex items-center justify-between border-b border-line px-6 py-4">
            <div>
              <h2 className="text-ui-lg font-semibold text-ink-1">Check-in</h2>
              <div className="mt-0.5 text-ui-xs text-ink-3">Acceso a eventos</div>
            </div>
            <span className="text-ink-3">{Icon.qr({ s: 20 })}</span>
          </header>
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

      <ParticipationLedger
        summary={summary}
        totalPoints={points?.cumulative ?? 0}
        termId={termId}
      />

      {qrOpen && (
        <Suspense fallback={null}>
          <MemberQrDialog open onOpenChange={setQrOpen} value={qrValue} name={member.name} />
        </Suspense>
      )}
    </div>
  );
}
