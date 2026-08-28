import { Link, getRouteApi } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { Badge, Button, Card, Dialog, type BadgeTone } from "@luminova/ui";
import { currentTermKey, type Member, type MemberInput, type MemberStatus } from "@luminova/types";
import { ActionGate } from "../../../lib/authz/action-gate";
import { useAuth } from "../../../lib/auth/auth";
import { useCan } from "../../../lib/authz/use-can";
import { PageHeader } from "../../../components/page-header";
import { QueryErrorState } from "../../../components/query-error-state";
import { encodeMemberQr } from "../../../lib/member-qr";
import { useMember } from "../hooks/use-member";
import { useMemberPoints } from "../hooks/use-member-points";
import { useMemberParticipations } from "../hooks/use-member-participations";
import { useMemberPointsByTerm } from "../hooks/use-member-points-by-term";
import { useActivitiesByTerm } from "../../activities/hooks/use-activities-by-term";
import { useInitiativesByTerm } from "../../initiatives/hooks/use-initiatives-by-term";
import { summarizeParticipations } from "../lib/participation-summary";
import { pointsRank } from "../../../lib/points-rank";
import { requestPasswordReset } from "../../../lib/auth/request-password-reset";
import { useProvisionMemberLogin } from "../hooks/use-provision-member-login";
import { useUpdateMember } from "../hooks/use-update-member";
import { useSetMemberPositions } from "../hooks/use-set-member-positions";
import { usePositions } from "../../positions/hooks/use-positions";
import { MemberForm } from "./member-form";
import { MemberPositionsForm, type PositionsInput } from "./member-positions-form";
import { MemberPermissionsPanel } from "./member-permissions-panel";
import { MemberPositionHistory } from "./member-position-history";
import { MemberPointsSummary } from "./member-points-summary";
import { ParticipationLedger } from "./participation-ledger";
import { effectiveRoles } from "../lib/member-permissions";
import { memberEditMode } from "../lib/member-edit-gate";
import { provisionErrorMessage } from "../lib/provision-error";
import { memberFormDefaults } from "../lib/member-form-defaults";

// qrcode.react (~13 kB gz) lazy so it leaves the always-loaded index shell.
const QrCode = lazy(() => import("@luminova/ui/qr-code").then((m) => ({ default: m.QrCode })));

// Admin-only + pulls MultiSelect — lazy so non-admins don't download it.
const MemberRolesPanel = lazy(() =>
  import("../../permissions/components/member-roles-panel").then((m) => ({
    default: m.MemberRolesPanel,
  })),
);

const route = getRouteApi("/_app/members_/$memberId");

const STATUS_TONE: Record<MemberStatus, BadgeTone> = {
  Activo: "green",
  Inactivo: "gray",
  Desafiliado: "red",
};

export function MemberProfilePage() {
  const { memberId } = route.useParams();
  const termId = currentTermKey();
  const gate = useCan();
  const uid = useAuth().user?.uid;
  const { data: member, isLoading, isError, error, refetch } = useMember(memberId);
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
  if (isError) return <QueryErrorState error={error} onRetry={() => refetch()} />;
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

  // Collection-level: MemberForm writes name/email/status/positions, which the rules'
  // self lane rejects. Probing the own-doc grant here rendered a full form a plain member
  // could never save — their four self-owned fields live on /me instead.
  const editMode = memberEditMode(gate);
  const canEdit = editMode === "full";
  const showPositionsOnly = editMode === "positions";
  // Member editing is split across two rules lanes; point the caller at the other one
  // instead of leaving "where do I edit this" to depend on whose profile it is.
  const isSelf = member.uid !== undefined && member.uid === uid;

  const handleEdit = (data: MemberInput) =>
    updateMember.mutateAsync({
      id: member.id,
      data,
      currentPositions: member.positions?.[termKey] ?? null,
    });
  const handleSetPositions = (data: PositionsInput) => setPositions.mutateAsync(data);

  return (
    <div className="flex flex-col gap-6 motion-reduce:animate-none">
      <Link to="/members" className="text-ui-sm text-ink-3 hover:text-ink-1">
        ← Volver a Miembros
      </Link>

      <PageHeader
        eyebrow="Miembro"
        title={member.name}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-3">
            {member.status && <Badge tone={STATUS_TONE[member.status]}>{member.status}</Badge>}
            {/* provisionMemberLogin is requireAdminOrPerm(create:MemberLogin) — the Admin
                role or that exact code, never the manage:all perm. */}
            <ActionGate when={gate.canProvisionLogin}>
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
                allowPowerGrants={gate.canAssignBoardSeat}
                onSubmit={handleEdit}
                avatarSeed={member.name}
              />
            </Card>
          )}

          {isSelf && !canEdit && (
            <Card as="section">
              <p className="text-ui-sm text-ink-2">
                Este es tu perfil. Puedes cambiar tu foto, teléfono, profesión y fecha de nacimiento
                desde{" "}
                <Link to="/me" className="font-semibold text-jci-blue hover:underline">
                  Mi panel
                </Link>
                .
              </p>
            </Card>
          )}

          {positions && showPositionsOnly && (
            <Card as="section">
              <h2 className="mb-4 text-ui-xs font-medium tracking-[0.02em] text-ink-3 uppercase">
                Cargos
              </h2>
              <MemberPositionsForm
                positions={positions}
                gender={member.gender}
                allowPowerGrants={gate.canAssignBoardSeat}
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
            <p className="text-ui-xs text-ink-3">QR personal · escanéalo en el check-in</p>
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
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = member.uid ? "Reenviar acceso" : "Invitar acceso";

  // beacon withholds the action link from a non-Admin caller (it is a bearer credential for
  // the account). The client then does what the invite drawer already does — send the reset
  // mail itself through the unprivileged sendPasswordResetEmail — so a delegate's invite
  // still lands. Without this the delegate got an empty code block and a copy button that
  // copied nothing, with the account already created and no way to set a password.
  const invite = () => {
    setError(null);
    provision.mutate(member.id, {
      onSuccess: (result) => {
        if (result.actionLink) {
          setLink(result.actionLink);
          setOpen(true);
          return;
        }
        setSent(false);
        void requestPasswordReset(result.email)
          .then(() => setSent(true))
          .catch((err: unknown) => {
            console.error("No se pudo enviar el correo de acceso", err);
            setError(
              "Se creó el acceso, pero no se pudo enviar el correo. Pídele a un Admin que lo reenvíe.",
            );
          });
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
        <p role="alert" className="basis-full text-right text-ui-xs text-error">
          {error}
        </p>
      )}
      {sent && (
        <p role="status" className="basis-full text-right text-ui-xs text-ink-3">
          Invitación enviada por correo.
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen} title="Acceso de miembro">
        <div className="flex flex-col gap-3">
          <p className="text-ui-sm text-ink-2">
            Comparte este enlace con el miembro para que cree su contraseña e inicie sesión.
          </p>
          <code className="block w-full overflow-x-auto rounded-[8px] bg-ink-1/[0.04] px-3 py-2 text-ui-xs text-ink-2">
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
