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
import { effectiveRoles, isSelfMember } from "../lib/member-permissions";
import { memberEditMode } from "../lib/member-edit-gate";
import { provisionErrorMessage } from "../lib/provision-error";
import { memberProvisionBlocked } from "../lib/provision-gate";
import { useCopyToClipboard } from "../../../lib/use-copy-to-clipboard";
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
  // isError, not just data: `memberProvisionBlocked` fails CLOSED on an unresolvable cargo, so
  // a failed catalog query (a rules regression, permission-denied — which TanStack does not
  // retry) silently removes the invite affordance from every seated member with nothing said.
  // Guardrail #3: loading, error and absent are three states, and only one of them is "wait".
  const { data: positions, isError: positionsFailed } = usePositions();
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
  const isSelf = isSelfMember(member, uid);
  // Fails closed while the catalog is still loading: an unresolvable cargo counts as
  // power-conferring, so a delegate sees the invite appear once positions land rather than
  // seeing it offered and then denied. An Admin is unaffected — the predicate short-circuits.
  const inviteBlocked = memberProvisionBlocked(member, (id) => positionsById.get(id), gate.isAdmin);

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
                role or that exact code, never the manage:all perm. memberProvisionBlocked
                mirrors every refusal the callable applies to a non-Admin, so a delegate is not
                shown a button that 403s on every click. Same predicate as the row menu and the
                invite drawer, deliberately. */}
            {/* Gated on the PERM only. `inviteBlocked` goes to InviteAccess as a prop rather
                than gating the mount, because a successful invite FLIPS it: beacon writes
                member.uid, the next refetch makes memberProvisionBlocked true (hasLogin), and
                unmounting here would destroy the component's own "enviada" / "no se pudo
                enviar el correo" state mid-flight — deleting, for a delegate, the only notice
                that the account exists with no password mail sent. */}
            <ActionGate when={gate.canProvisionLogin}>
              {/* An Admin is subject to none of the refusals `inviteBlocked` mirrors, so the
                  failed catalog cannot mislead them. For everyone else it decides the
                  affordance, and "we could not check" must not render as "not allowed". */}
              {positionsFailed && !gate.isAdmin ? (
                <p role="alert" className="basis-full text-right text-ui-xs text-error">
                  No se pudo cargar el catálogo de cargos, así que no podemos verificar si este
                  miembro puede recibir acceso. Recarga la página.
                </p>
              ) : (
                /* key: the mount gate used to be `!inviteBlocked`, which ALSO happened to reset
                   this component between members. It no longer does, and TanStack Router renders
                   the same MemberProfilePage instance across a /members/A → /members/B
                   navigation (no key on Match), while `isLoading` skips the unmount whenever B
                   is warm in cache. Without this, B's header shows A's "Invitación enviada".
                   Stable across the refetch that sets member.uid, so it does not reintroduce
                   the flip-erases-its-own-result bug. */
                <InviteAccess key={member.id} member={member} blocked={inviteBlocked} />
              )}
            </ActionGate>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          {positions && canEdit && (
            <Card as="section">
              {/* key, for the same reason as InviteAccess above and MemberDrawer's copy: RHF
                  reads `defaultValues` once at mount, and this page is NOT remounted across a
                  /members/A → /members/B param change when B is warm in cache. Without it the
                  form keeps A's name/email/status while `member.id` and `handleEdit` have moved
                  to B — «Guardar cambios» then writes A's identity onto B's document. */}
              <MemberForm
                key={member.id}
                positions={positions}
                defaultValues={memberFormDefaults(member)}
                submitLabel="Guardar cambios"
                pendingLabel="Guardando…"
                allowPowerGrants={gate.canAssignBoardSeat}
                allowReplacePowerCargo={gate.isAdmin}
                assignerIsAdmin={gate.isAdmin}
                isSelfAssignment={isSelf}
                onSubmit={handleEdit}
                avatarSeed={member.name}
              />
            </Card>
          )}

          {/* Both editors below are gated on `positions` being present. Without this an editor
              whose catalog query FAILED gets a page with no form and no explanation — the
              absent/error conflation guardrail #3 names. */}
          {positionsFailed && (canEdit || showPositionsOnly) && (
            <Card as="section">
              <p role="alert" className="text-ui-sm text-error">
                No se pudo cargar el catálogo de cargos, así que el formulario no está disponible.
                Recarga la página.
              </p>
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
              {/* Same reason as MemberForm above: without the key this form would save A's
                  cargo and comisiones onto B. */}
              <MemberPositionsForm
                key={member.id}
                positions={positions}
                gender={member.gender}
                allowPowerGrants={gate.canAssignBoardSeat}
                allowReplacePowerCargo={gate.isAdmin}
                assignerIsAdmin={gate.isAdmin}
                isSelfAssignment={isSelf}
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

function InviteAccess({ member, blocked }: { member: Member; blocked: boolean }) {
  // Provisioning AND the reset mail are one mutation (use-provision-member-login): a mail sent
  // from a component-scoped onSuccess is dropped whenever this component is gone by the time
  // the callable resolves, which `key={member.id}` above makes reachable by merely switching
  // members. So there is no floating promise left to interleave, and no attempt counter: the
  // mutation's own state IS the latest attempt.
  const provision = useProvisionMemberLogin();
  const [dismissed, setDismissed] = useState(false);
  const { copyState, copy, resetCopyState } = useCopyToClipboard();
  const label = member.uid ? "Reenviar acceso" : "Invitar acceso";
  const result = provision.data;
  // Only present when the mail did NOT go out — the hook nulls it otherwise, because sending
  // the mail invalidates this oobCode. See InviteResult.fallbackLink.
  const link = result?.fallbackLink ?? null;
  const error = provision.isError
    ? provisionErrorMessage(provision.error, "No se pudo generar el acceso.")
    : result && !result.emailSent
      ? "Se creó el acceso, pero no se pudo enviar el correo. " +
        (result.fallbackLink
          ? "Comparte el enlace manualmente."
          : "Pídele a un administrador que lo reenvíe.")
      : null;

  const invite = () => {
    setDismissed(false);
    resetCopyState();
    provision.mutate(member.id);
  };

  return (
    <>
      {/* The BUTTON goes away when the callable would refuse; the feedback below does not.
          `blocked` becomes true the moment this invite succeeds (the member now has a uid and
          the hook invalidates the query), so gating the whole component on it would erase the
          result of the click that set it. */}
      {!blocked && (
        <Button
          as="button"
          type="button"
          variant="secondary"
          disabled={provision.isPending}
          onClick={invite}
        >
          {provision.isPending ? "Generando…" : label}
        </Button>
      )}
      {error && (
        <p role="alert" className="basis-full text-right text-ui-xs text-error">
          {error}
        </p>
      )}
      {result?.emailSent && (
        <p role="status" className="basis-full text-right text-ui-xs text-ink-3">
          Invitación enviada por correo.
        </p>
      )}
      <Dialog
        open={link !== null && !dismissed}
        onOpenChange={(o) => {
          if (!o) setDismissed(true);
        }}
        title="Acceso de miembro"
      >
        <div className="flex flex-col gap-3">
          {/* This dialog exists ONLY on the mail-failure branch, so it never claims the member
              was emailed. The mail failure is repeated here rather than left to the header
              alert: the modal's aria-hidden takes that alert out of the accessibility tree. */}
          <p className="text-ui-sm text-ink-2">
            No se pudo enviar el correo. Comparte este enlace con el miembro para que cree su
            contraseña e inicie sesión.
          </p>
          <code className="block w-full overflow-x-auto rounded-[8px] bg-ink-1/[0.04] px-3 py-2 text-ui-xs text-ink-2">
            {link}
          </code>
          <Button as="button" type="button" onClick={() => link && copy(link)}>
            {copyState === "copied" ? "Enlace copiado" : "Copiar enlace"}
          </Button>
          {copyState === "failed" && (
            <p role="alert" className="text-ui-xs text-error">
              No se pudo copiar. Selecciona el enlace de arriba y cópialo manualmente.
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
