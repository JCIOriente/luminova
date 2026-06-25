import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo } from "react";
import { Icon } from "@luminova/ui";
import { PageHeader } from "../components/page-header";
import { currentTermKey } from "@luminova/types";
import { encodeMemberQr } from "../lib/member-qr";
import { pointsRank } from "../lib/points-rank";
import { useCurrentMember } from "../features/members/hooks/use-current-member";
import { useMemberPoints } from "../features/members/hooks/use-member-points";
import { useMemberParticipations } from "../features/members/hooks/use-member-participations";
import { useMemberPointsByTerm } from "../features/members/hooks/use-member-points-by-term";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useInitiativesByTerm } from "../features/initiatives/hooks/use-initiatives-by-term";
import {
  PARTICIPATION_ROLE_LABEL,
  summarizeParticipations,
} from "../features/members/lib/participation-summary";
import { MemberPointsSummary } from "../features/members/components/member-points-summary";
import { MemberCredentialCard } from "../features/members/components/member-credential-card";
import { ParticipationLedger } from "../features/members/components/participation-ledger";

// qrcode.react (~13 kB gz) lazy so it leaves the always-loaded index shell.
const QrCode = lazy(() => import("@luminova/ui/qr-code").then((m) => ({ default: m.QrCode })));

export const Route = createFileRoute("/_app/me")({ component: MemberHome });

export function MemberHome() {
  const termId = currentTermKey();
  const { data: member, isLoading } = useCurrentMember();
  const memberId = member?.id ?? "";
  const { data: points } = useMemberPoints(memberId, termId);
  const { data: participations } = useMemberParticipations(memberId, termId);
  const { data: allPoints } = useMemberPointsByTerm(termId);
  const { data: activities } = useActivitiesByTerm(termId);
  const { data: initiatives } = useInitiativesByTerm(termId, {
    includePrograms: true,
    includeProjects: true,
  });

  const summary = useMemo(
    () => summarizeParticipations(participations ?? [], activities ?? [], initiatives ?? []),
    [participations, activities, initiatives],
  );

  const rank = useMemo(
    () => (allPoints && member ? pointsRank(allPoints, member.id) : null),
    [allPoints, member],
  );

  if (isLoading) return <p className="text-ink-3">Cargando…</p>;
  if (!member) {
    return <p className="text-ink-2">Tu usuario no está vinculado a un perfil de miembro.</p>;
  }

  const latest = summary.rows[0];
  const role = latest ? PARTICIPATION_ROLE_LABEL[latest.role] : null;
  const initiative = latest?.parentTitle ?? latest?.activityTitle ?? null;
  const joinYear = member.joinDate ? member.joinDate.toDate().getFullYear() : null;

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
          joinYear={joinYear}
          role={role}
          initiative={initiative}
        />
        <section className="flex flex-col rounded-card border border-line bg-surface">
          <header className="flex items-center justify-between border-b border-line px-6 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink-1">Check-in</h2>
              <div className="mt-0.5 text-[12px] text-ink-3">Acceso a eventos</div>
            </div>
            <span className="text-ink-3">{Icon.qr({ s: 20 })}</span>
          </header>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-6">
            <div className="rounded-[14px] border border-line bg-jci-white p-3.5">
              <Suspense fallback={<div className="size-[168px]" />}>
                <QrCode value={encodeMemberQr(member.id)} size={168} />
              </Suspense>
            </div>
            <p className="max-w-[220px] text-center text-[12.5px] leading-relaxed text-ink-3">
              <span className="font-semibold text-ink-2">Tu QR personal.</span> Muéstralo en el
              check-in para registrar tu asistencia.
            </p>
          </div>
        </section>
      </div>

      <ParticipationLedger
        summary={summary}
        totalPoints={points?.cumulative ?? 0}
        termId={termId}
      />
    </div>
  );
}
