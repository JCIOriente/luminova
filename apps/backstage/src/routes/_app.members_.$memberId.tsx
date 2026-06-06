import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Button, Dialog, type BadgeTone } from "@luminova/ui";
import { QrCode } from "@luminova/ui/qr-code";
import type { Member, MemberStatus } from "@luminova/types";
import { Can } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { encodeMemberQr } from "../lib/member-qr";
import { currentTermId } from "../lib/current-term";
import { useMember } from "../features/members/hooks/use-member";
import { useMemberPoints } from "../features/members/hooks/use-member-points";
import { useMemberParticipations } from "../features/members/hooks/use-member-participations";
import { useProvisionMemberLogin } from "../features/members/hooks/use-provision-member-login";
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
          <div className="flex items-center gap-3">
            {member.status && <Badge tone={STATUS_TONE[member.status]}>{member.status}</Badge>}
            <Can I="manage" a="all">
              <InviteAccess member={member} />
            </Can>
          </div>
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

function InviteAccess({ member }: { member: Member }) {
  const provision = useProvisionMemberLogin();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const label = member.uid ? "Reenviar acceso" : "Invitar acceso";

  const invite = () =>
    provision.mutate(member.id, {
      onSuccess: (result) => {
        setLink(result.actionLink);
        setOpen(true);
      },
    });

  return (
    <>
      <Button
        as="button"
        type="button"
        variant="secondary"
        disabled={provision.isPending}
        onClick={invite}
      >
        {provision.isPending ? "Generando…" : label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Acceso de miembro">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-2">
            Comparte este enlace con el miembro para que cree su contraseña e inicie sesión.
          </p>
          <code className="block w-full overflow-x-auto rounded-[8px] bg-ink-1/[0.04] px-3 py-2 text-[12px] text-ink-2">
            {link}
          </code>
          <Button
            as="button"
            type="button"
            onClick={() => link && void navigator.clipboard.writeText(link)}
          >
            Copiar enlace
          </Button>
        </div>
      </Dialog>
    </>
  );
}
