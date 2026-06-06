import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, type BadgeTone } from "@luminova/ui";
import { QrCode } from "@luminova/ui/qr-code";
import type { MemberStatus } from "@luminova/types";
import { PageHeader } from "../components/page-header";
import { encodeMemberQr } from "../lib/member-qr";
import { currentTermId } from "../lib/current-term";
import { useMember } from "../features/members/hooks/use-member";
import { useMemberPoints } from "../features/members/hooks/use-member-points";
import { useMemberParticipations } from "../features/members/hooks/use-member-participations";
import { MemberPointsSummary } from "../features/members/components/member-points-summary";
import { ParticipationLedger } from "../features/members/components/participation-ledger";

export const Route = createFileRoute("/_app/members_/$memberId")({
  component: MemberProfilePage,
});

const STATUS_TONE: Record<MemberStatus, BadgeTone> = {
  Activo: "green",
  Inactivo: "gray",
  Desafiliado: "red",
};

function MemberProfilePage() {
  const { memberId } = Route.useParams();
  const termId = currentTermId();
  const { data: member, isLoading } = useMember(memberId);
  const { data: points } = useMemberPoints(memberId, termId);
  const { data: participations } = useMemberParticipations(memberId, termId);

  if (isLoading) return <p className="text-ink-3">Cargando…</p>;
  if (!member) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-ink-2">Miembro no encontrado.</p>
        <Link to="/members" className="text-jci-blue hover:underline">
          ← Volver a Miembros
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/members" className="text-[13px] text-ink-3 hover:text-ink-1">
        ← Volver a Miembros
      </Link>

      <PageHeader
        eyebrow="Miembro"
        title={member.name}
        actions={
          member.status ? (
            <Badge tone={STATUS_TONE[member.status]}>{member.status}</Badge>
          ) : undefined
        }
      />

      <MemberPointsSummary points={points} termId={termId} />

      <div className="flex w-fit flex-col items-center gap-3 rounded-[14px] border border-line bg-surface px-6 py-5">
        <QrCode value={encodeMemberQr(member.id)} size={176} />
        <p className="text-[12px] text-ink-3">QR personal · escanéalo en el check-in</p>
      </div>

      <ParticipationLedger rows={participations ?? []} />
    </div>
  );
}
