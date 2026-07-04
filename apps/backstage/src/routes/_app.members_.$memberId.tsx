import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { Badge, Button, Card, Dialog, type BadgeTone } from "@luminova/ui";
import { currentTermKey, type Member, type MemberInput, type MemberStatus } from "@luminova/types";
import { subject } from "@luminova/auth/ability";
import { useAbility } from "../lib/authz/ability-context";
import { ActionGate } from "../lib/authz/action-gate";
import { useCan } from "../lib/authz/use-can";
import { PageHeader } from "../components/page-header";
import { encodeMemberQr } from "../lib/member-qr";
import { useMember } from "../features/members/hooks/use-member";
import { useMemberPoints } from "../features/members/hooks/use-member-points";
import { useMemberParticipations } from "../features/members/hooks/use-member-participations";
import { useMemberPointsByTerm } from "../features/members/hooks/use-member-points-by-term";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useInitiativesByTerm } from "../features/initiatives/hooks/use-initiatives-by-term";
import { summarizeParticipations } from "../features/members/lib/participation-summary";
import { pointsRank } from "../lib/points-rank";
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
import { provisionErrorMessage } from "../features/members/lib/provision-error";
import { memberFormDefaults } from "../features/members/lib/member-form-defaults";

// qrcode.react (~13 kB gz) lazy so it leaves the always-loaded index shell.
const QrCode = lazy(() => import("@luminova/ui/qr-code").then((m) => ({ default: m.QrCode })));

// Admin-only + pulls MultiSelect — lazy so non-admins don't download it.
const MemberRolesPanel = lazy(() =>
  import("../features/permissions/components/member-roles-panel").then((m) => ({
    default: m.MemberRolesPanel,
  })),
);

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
  const termId = currentTermKey();
  const ability = useAbility();
  const gate = useCan();
  const { data: member, isLoading } = useMember(memberId);
  const { data: positions } = usePositions();
  const { data: points } = useMemberPoints(memberId, termId);
  const { data: participations } = useMemberParticipations(memberId, termId);
  const { data: allPoints } = useMemberPointsByTerm(termId);
  const { data: activities } = useActivitiesByTerm(termId);
  const { data: initiatives } = useInitiativesByTerm(termId, {
    includePrograms: true,
    includeProjects: true,
  });
  const updateMember = useUpdateMember();
  const setPositions = useSetMemberPositions(memberId);

  const positionsById = useMemo(
    () => new Map((positions ?? []).map((p) => [p.id, p])),
    [positions],
  );
  const summary = useMemo(
    () => summarizeParticipations(participations ?? [], activities ?? [], initiatives ?? []),
    [participations, activities, initiatives],
  );
  const rank = useMemo(
    () => (allPoints ? pointsRank(allPoints, memberId) : null),
    [allPoints, memberId],
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
  // The positions-only lane maps to the ExecutiveCommittee allow-rule (positions-only
  // member writes). Gate on the EC *role*, not the manage:Position perm — a custom
  // role with that perm but no EC claim would be denied at write.
  const showPositionsOnly = !canEdit && gate.hasRole(["ExecutiveCommittee"]);

  const handleEdit = (data: MemberInput) =>
    updateMember.mutateAsync({
      id: member.id,
      data,
      currentPositions: member.positions?.[termKey] ?? null,
    });
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
            {/* provisionMemberLogin is requireAdmin (role), not the manage:all perm. */}
            <ActionGate role={["Admin"]}>
              <InviteAccess member={member} />
            </ActionGate>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          {positions && canEdit && (
            <Card as="section">
              <MemberForm
                positions={positions}
                defaultValues={memberFormDefaults(member)}
                submitLabel="Guardar cambios"
                pendingLabel="Guardando…"
                allowPowerGrants={gate.canAssignPowerGrants}
                onSubmit={handleEdit}
                avatarSeed={member.name}
              />
            </Card>
          )}

          {positions && showPositionsOnly && (
            <Card as="section">
              <h2 className="mb-4 text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">
                Cargos
              </h2>
              <MemberPositionsForm
                positions={positions}
                gender={member.gender}
                allowPowerGrants={gate.canAssignPowerGrants}
                defaultValues={{
                  cargoId: member.positions?.[termKey]?.cargoId ?? null,
                  comisionIds: member.positions?.[termKey]?.comisionIds ?? [],
                }}
                onSubmit={handleSetPositions}
              />
            </Card>
          )}

          <MemberPointsSummary
            points={points}
            termId={termId}
            rank={rank}
            activityCount={summary.activityCount}
          />
          <ParticipationLedger
            summary={summary}
            totalPoints={points?.cumulative ?? 0}
            termId={termId}
          />
        </div>

        <aside className="flex flex-col gap-6">
          <MemberPermissionsPanel roles={roles} />
          {/* roleIds/permissionOverrides writes are Admin-role-only (firestore.rules). */}
          <ActionGate role={["Admin"]}>
            <Suspense fallback={null}>
              <MemberRolesPanel member={member} builtInRoleNames={roles} />
            </Suspense>
          </ActionGate>
          <MemberPositionHistory
            member={member}
            positionsById={positionsById}
            currentTermKey={termKey}
          />
          <Card padding="none" className="flex flex-col items-center gap-3 px-6 py-5">
            <Suspense fallback={<div className="size-[176px]" />}>
              <QrCode value={encodeMemberQr(member.id)} size={176} />
            </Suspense>
            <p className="text-[12px] text-ink-3">QR personal · escanéalo en el check-in</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function InviteAccess({ member }: { member: Member }) {
  const provision = useProvisionMemberLogin();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = member.uid ? "Reenviar acceso" : "Invitar acceso";

  const invite = () => {
    setError(null);
    provision.mutate(member.id, {
      onSuccess: (result) => {
        setLink(result.actionLink);
        setOpen(true);
      },
      onError: (err) => setError(provisionErrorMessage(err, "No se pudo generar el acceso.")),
    });
  };

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
      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}
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
