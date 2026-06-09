import { createFileRoute } from "@tanstack/react-router";
import { ImageUploader } from "@luminova/ui";
import { QrCode } from "@luminova/ui/qr-code";
import { PageHeader } from "../components/page-header";
import { currentTermId } from "../lib/current-term";
import { encodeMemberQr } from "../lib/member-qr";
import { pointsRank } from "../lib/points-rank";
import { useCurrentMember } from "../features/members/hooks/use-current-member";
import { useMemberPhoto } from "../features/members/hooks/use-member-photo";
import { useMemberPoints } from "../features/members/hooks/use-member-points";
import { useMemberParticipations } from "../features/members/hooks/use-member-participations";
import { useMemberPointsByTerm } from "../features/members/hooks/use-member-points-by-term";
import { MemberPointsSummary } from "../features/members/components/member-points-summary";
import { ParticipationLedger } from "../features/members/components/participation-ledger";

export const Route = createFileRoute("/_app/me")({ component: MemberHome });

function MemberPhotoCard({ memberId, name, src }: { memberId: string; name: string; src: string | null }) {
  const { onUpload, onRemove } = useMemberPhoto(memberId);
  return (
    <div className="w-fit rounded-[14px] border border-line bg-surface px-6 py-5">
      <ImageUploader currentSrc={src} name={name} onUpload={onUpload} onRemove={onRemove} />
    </div>
  );
}

export function MemberHome() {
  const termId = currentTermId();
  const { data: member, isLoading } = useCurrentMember();
  const memberId = member?.id ?? "";
  const { data: points } = useMemberPoints(memberId, termId);
  const { data: participations } = useMemberParticipations(memberId, termId);
  const { data: allPoints } = useMemberPointsByTerm(termId);

  if (isLoading) return <p className="text-ink-3">Cargando…</p>;
  if (!member) {
    return <p className="text-ink-2">Tu usuario no está vinculado a un perfil de miembro.</p>;
  }

  const rank = allPoints ? pointsRank(allPoints, member.id) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Mi panel" title={member.name} />
      <MemberPhotoCard memberId={member.id} name={member.name} src={member.profilePicture} />
      <MemberPointsSummary points={points} termId={termId} />
      {rank && (
        <p className="text-[13px] text-ink-2">
          Puesto por puntos · <span className="font-semibold text-ink-1">{rank.rank}</span> de{" "}
          {rank.total}
        </p>
      )}
      <div className="flex w-fit flex-col items-center gap-3 rounded-[14px] border border-line bg-surface px-6 py-5">
        <QrCode value={encodeMemberQr(member.id)} size={176} />
        <p className="text-[12px] text-ink-3">Tu QR personal · muéstralo en el check-in</p>
      </div>
      <ParticipationLedger rows={participations ?? []} />
    </div>
  );
}
