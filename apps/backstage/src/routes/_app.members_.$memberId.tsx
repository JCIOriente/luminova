import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge, Button, Dialog, type BadgeTone } from "@luminova/ui";
import { QrCode } from "@luminova/ui/qr-code";
import { currentTermKey, type Member, type MemberInput, type MemberStatus } from "@luminova/types";
import { subject } from "@luminova/auth/ability";
import { Can, useAbility } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { encodeMemberQr } from "../lib/member-qr";
import { currentTermId } from "../lib/current-term";
import { useMember } from "../features/members/hooks/use-member";
import { useMemberPoints } from "../features/members/hooks/use-member-points";
import { useMemberParticipations } from "../features/members/hooks/use-member-participations";
import { useProvisionMemberLogin } from "../features/members/hooks/use-provision-member-login";
import { useUpdateMember } from "../features/members/hooks/use-update-member";
import { useSetMemberPositions } from "../features/members/hooks/use-set-member-positions";
import { usePositions } from "../features/positions/hooks/use-positions";
import { MemberForm } from "../features/members/components/member-form";
import {
  MemberPositionsForm,
  type PositionsInput,
} from "../features/members/components/member-positions-form";
import { MemberPermissionsPanel } from "../features/members/components/member-permissions-panel";
import { MemberPositionHistory } from "../features/members/components/member-position-history";
import { MemberPointsSummary } from "../features/members/components/member-points-summary";
import { ParticipationLedger } from "../features/members/components/participation-ledger";
import { effectiveRoles } from "../features/members/lib/member-permissions";
import { memberFormDefaults } from "../features/members/lib/member-form-defaults";

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
  const ability = useAbility();
  const { data: member, isLoading } = useMember(memberId);
  const { data: positions } = usePositions();
  const { data: points } = useMemberPoints(memberId, termId);
  const { data: participations } = useMemberParticipations(memberId, termId);
  const updateMember = useUpdateMember();
  const setPositions = useSetMemberPositions(memberId);

  const positionsById = useMemo(
    () => new Map((positions ?? []).map((p) => [p.id, p])),
    [positions],
  );
  const termKey = currentTermKey();
  const roles = useMemo(
    () => (member ? effectiveRoles(member, positionsById, termKey) : ["Member" as const]),
    [member, positionsById, termKey],
  );

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

  const canEdit = ability.can("update", subject("Member", { uid: member.uid }));
  const canManagePositions = ability.can("manage", "Position");
  const showPositionsOnly = !canEdit && canManagePositions;

  const handleEdit = (data: MemberInput) => updateMember.mutateAsync({ id: member.id, data });
  const handleSetPositions = (data: PositionsInput) => setPositions.mutateAsync(data);

  return (
    <div className="flex flex-col gap-6 motion-reduce:animate-none">
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

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          {positions && canEdit && (
            <section className="rounded-card border border-line bg-surface p-5">
              <MemberForm
                positions={positions}
                defaultValues={memberFormDefaults(member)}
                submitLabel="Guardar cambios"
                pendingLabel="Guardando…"
                onSubmit={handleEdit}
                avatarSeed={member.name}
              />
            </section>
          )}

          {positions && showPositionsOnly && (
            <section className="rounded-card border border-line bg-surface p-5">
              <h2 className="mb-4 text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">
                Cargos
              </h2>
              <MemberPositionsForm
                positions={positions}
                gender={member.gender}
                defaultValues={{
                  cargoId: member.positions?.[termKey]?.cargoId ?? null,
                  comisionIds: member.positions?.[termKey]?.comisionIds ?? [],
                }}
                onSubmit={handleSetPositions}
              />
            </section>
          )}

          <MemberPointsSummary points={points} termId={termId} />
          <ParticipationLedger rows={participations ?? []} />
        </div>

        <aside className="flex flex-col gap-6">
          <MemberPermissionsPanel roles={roles} />
          <MemberPositionHistory
            member={member}
            positionsById={positionsById}
            currentTermKey={termKey}
          />
          <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-5">
            <QrCode value={encodeMemberQr(member.id)} size={176} />
            <p className="text-[12px] text-ink-3">QR personal · escanéalo en el check-in</p>
          </div>
        </aside>
      </div>
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
