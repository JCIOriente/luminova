import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Input, Icon, Dialog, Toast, EmptyState } from "@luminova/ui";
import { currentTermKey, type Member, type MemberInput, type MemberStatus } from "@luminova/types";
import { useMembers } from "../features/members/hooks/use-members";
import { usePositions } from "../features/positions/hooks/use-positions";
import { useAddMember } from "../features/members/hooks/use-add-member";
import { useUpdateMember } from "../features/members/hooks/use-update-member";
import { useSetMemberStatus } from "../features/members/hooks/use-set-member-status";
import { useProvisionMemberLogin } from "../features/members/hooks/use-provision-member-login";
import { requestPasswordReset } from "../lib/auth/request-password-reset";
import { MemberTable } from "../features/members/components/member-table";
import { MemberStatusFilter } from "../features/members/components/member-status-filter";
import { MemberFilterMeta } from "../features/members/components/member-filter-meta";
import { MemberDrawer } from "../features/members/components/member-drawer";
import { MemberInviteDrawer } from "../features/members/components/member-invite-drawer";
import {
  filterMembers,
  statusCounts,
  type StatusFilter,
} from "../features/members/lib/member-filter";
import { membersToCsv, downloadCsv } from "../features/members/lib/member-csv";
import { actionMessage, memberPositionLabel } from "../features/members/lib/member-display";
import { PageHeader } from "../components/page-header";
import { Can } from "../lib/authz/ability-context";

export const Route = createFileRoute("/_app/members")({
  component: MembersPage,
});

interface DrawerState {
  mode: "view" | "edit";
  member: Member;
}
interface ConfirmState {
  member: Member;
}

const PAGE_SIZE = 8;

function MembersPage() {
  const { data: members, isLoading, isError } = useMembers();
  const { data: positions } = usePositions();
  const addMember = useAddMember();
  const updateMember = useUpdateMember();
  const setMemberStatus = useSetMemberStatus();
  const provision = useProvisionMemberLogin();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("Todos");
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  const all = members ?? [];
  const counts = useMemo(() => statusCounts(all), [all]);
  const positionsById = useMemo(
    () => new Map((positions ?? []).map((p) => [p.id, p])),
    [positions],
  );
  const roleLabel = useCallback(
    (member: Member) => memberPositionLabel(member, positionsById, currentTermKey()),
    [positionsById],
  );
  const filtered = useMemo(
    () => filterMembers(all, { search, status }, roleLabel),
    [all, search, status, roleLabel],
  );

  const clearAll = () => {
    setSearch("");
    setStatus("Todos");
  };

  const handleSetStatus = (member: Member, next: MemberStatus) => {
    if (next === "Desafiliado") {
      setConfirm({ member });
      return;
    }
    setMemberStatus.mutate({ id: member.id, status: next });
    setToast(actionMessage(member.name, next === "Inactivo" ? "deactivated" : "reactivated"));
  };

  const handleProvision = async (member: Member) => {
    if (provision.isPending) return;
    try {
      const { email } = await provision.mutateAsync(member.id);
      try {
        await requestPasswordReset(email);
        setToast(actionMessage(member.name, "invited"));
      } catch {
        setToast("Acceso creado, pero el correo no se envió.");
      }
    } catch {
      setToast("No se pudo enviar la invitación.");
    }
  };

  const handleEditSubmit = async (data: MemberInput) => {
    if (!drawer) return;
    await updateMember.mutateAsync({ id: drawer.member.id, data });
    setToast(actionMessage(data.name, "saved"));
    setDrawer(null);
  };

  const confirmAction = () => {
    if (!confirm) return;
    const { member } = confirm;
    setMemberStatus.mutate({ id: member.id, status: "Desafiliado" });
    setToast(actionMessage(member.name, "disaffiliated"));
    setConfirm(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`${all.length} miembros`}
        title="Miembros"
        subtitle="Gestiona la membresía del capítulo, roles y estados."
        actions={
          <>
            <Can I="manage" a="Member">
              <Button
                as="button"
                type="button"
                variant="secondary"
                iconLeft={Icon.download({ s: 18 })}
                onClick={() => downloadCsv("miembros.csv", membersToCsv(filtered, roleLabel))}
              >
                Exportar
              </Button>
            </Can>
            <Can I="create" a="Member">
              <Button
                as="button"
                type="button"
                iconLeft={Icon.plus({ s: 18 })}
                onClick={() => setInviteOpen(true)}
              >
                Invitar miembro
              </Button>
            </Can>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3">
            {Icon.search({ s: 18 })}
          </span>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, rol o correo…"
            aria-label="Buscar miembros"
            className="h-11 pl-11"
          />
        </div>
        <MemberStatusFilter value={status} counts={counts} onChange={setStatus} />
      </div>

      <MemberFilterMeta
        shown={filtered.length}
        total={all.length}
        search={search}
        status={status}
        onClearSearch={() => setSearch("")}
        onClearStatus={() => setStatus("Todos")}
        onClearAll={clearAll}
      />

      {isError ? (
        <p role="alert" className="text-error">
          No se pudieron cargar los miembros.
        </p>
      ) : (
        <MemberTable
          members={filtered}
          pageSize={PAGE_SIZE}
          roleLabel={roleLabel}
          isLoading={isLoading}
          emptyState={
            <EmptyState
              icon={Icon.search({ s: 40 })}
              title="Sin resultados"
              description="Ningún miembro coincide con los filtros actuales."
            />
          }
          onView={(member) => setDrawer({ mode: "view", member })}
          onEdit={(member) => setDrawer({ mode: "edit", member })}
          onProvision={(member) => void handleProvision(member)}
          onSetStatus={handleSetStatus}
        />
      )}

      <MemberDrawer
        open={drawer !== null}
        mode={drawer?.mode ?? "view"}
        member={drawer?.member ?? null}
        positions={positions ?? []}
        onClose={() => setDrawer(null)}
        onEditMode={() => setDrawer((d) => (d ? { ...d, mode: "edit" } : d))}
        onSubmit={handleEditSubmit}
      />

      <MemberInviteDrawer
        open={inviteOpen}
        positions={positions ?? []}
        onClose={() => setInviteOpen(false)}
        onCreate={(data) => addMember.mutateAsync(data)}
        onProvision={(memberId) => provision.mutateAsync(memberId)}
      />

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title="Desafiliar miembro"
        description={
          confirm
            ? `¿Desafiliar a ${confirm.member.name}? Cambiará su estado a Desafiliado. Puedes revertirlo luego.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button as="button" type="button" variant="secondary" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
          <Button as="button" type="button" onClick={confirmAction}>
            Desafiliar
          </Button>
        </div>
      </Dialog>

      {toast && <Toast message={toast} icon={Icon.check({ s: 18 })} />}
    </div>
  );
}
