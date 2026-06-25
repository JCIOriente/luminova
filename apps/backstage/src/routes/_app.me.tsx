import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo } from "react";
import { ImageUploader } from "@luminova/ui";
import { PageHeader } from "../components/page-header";
import { currentTermKey } from "@luminova/types";
import { encodeMemberQr } from "../lib/member-qr";
import { pointsRank } from "../lib/points-rank";
import { useCurrentMember } from "../features/members/hooks/use-current-member";
import { useMemberPhoto } from "../features/members/hooks/use-member-photo";
import { useMemberPoints } from "../features/members/hooks/use-member-points";
import { useMemberParticipations } from "../features/members/hooks/use-member-participations";
import { useMemberPointsByTerm } from "../features/members/hooks/use-member-points-by-term";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useInitiativesByTerm } from "../features/initiatives/hooks/use-initiatives-by-term";
import { summarizeParticipations } from "../features/members/lib/participation-summary";
import { MemberPointsSummary } from "../features/members/components/member-points-summary";
import { ParticipationLedger } from "../features/members/components/participation-ledger";

// qrcode.react (~13 kB gz) lazy so it leaves the always-loaded index shell.
const QrCode = lazy(() => import("@luminova/ui/qr-code").then((m) => ({ default: m.QrCode })));

export const Route = createFileRoute("/_app/me")({ component: MemberHome });

function MemberPhotoCard({
  memberId,
  name,
  src,
}: {
  memberId: string;
  name: string;
  src: string | null;
}) {
  const { onUpload, onRemove } = useMemberPhoto(memberId);
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface px-6 py-5">
      <div className="font-mono text-[11px] tracking-[0.14em] text-ink-3 uppercase">Tu foto</div>
      <ImageUploader currentSrc={src} name={name} onUpload={onUpload} onRemove={onRemove} />
    </div>
  );
}

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Mi panel" title={member.name} />

      <MemberPointsSummary
        points={points}
        termId={termId}
        rank={rank}
        activityCount={summary.activityCount}
      />

      <div className="grid gap-6 sm:grid-cols-[auto_auto] sm:items-start">
        <MemberPhotoCard memberId={member.id} name={member.name} src={member.profilePicture} />
        <div className="flex flex-col items-center gap-3 rounded-[14px] border border-line bg-surface px-6 py-5">
          <Suspense fallback={<div className="size-[176px]" />}>
            <QrCode value={encodeMemberQr(member.id)} size={176} />
          </Suspense>
          <p className="text-[12px] text-ink-3">Tu QR personal · muéstralo en el check-in</p>
        </div>
      </div>

      <ParticipationLedger summary={summary} />
    </div>
  );
}
