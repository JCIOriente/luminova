import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Input, Icon, Dialog, Toast, EmptyState } from "@luminova/ui";
import type { Member, MemberInput, MemberStatus } from "@luminova/types";
import { useMembers } from "../features/members/hooks/use-members";
import { useAddMember } from "../features/members/hooks/use-add-member";
import { useUpdateMember } from "../features/members/hooks/use-update-member";
import { useDeleteMember } from "../features/members/hooks/use-delete-member";
import { useSetMemberStatus } from "../features/members/hooks/use-set-member-status";
import { useProvisionMemberLogin } from "../features/members/hooks/use-provision-member-login";
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
import { actionMessage } from "../features/members/lib/member-display";
import { PageHeader } from "../components/page-header";
import { Can } from "../lib/authz/ability-context";

export const Route = createFileRoute("/_app/members")({
  component: MembersPage,
});

interface DrawerState {
  mode: "view" | "edit";
  member: Member;
}
type ConfirmKind = "disaffiliate" | "delete";
interface ConfirmState {
  kind: ConfirmKind;
  member: Member;
}

const PAGE_SIZE = 8;

function MembersPage() {
  const { data: members, isLoading, isError } = useMembers();
  const addMember = useAddMember();
  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();
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
  const filtered = useMemo(() => filterMembers(all, { search, status }), [all, search, status]);

  const clearAll = () => {
    setSearch("");
    setStatus("Todos");
  };

  const handleSetStatus = (member: Member, next: MemberStatus) => {
    if (next === "Desafiliado") {
      setConfirm({ kind: "disaffiliate", member });
      return;
    }
    setMemberStatus.mutate({ id: member.id, status: next });
    setToast(actionMessage(member.name, next === "Inactivo" ? "deactivated" : "reactivated"));
  };

  const handleProvision = async (member: Member) => {
    try {
      await provision.mutateAsync(member.id);
      setToast(actionMessage(member.name, "invited"));
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
    const { kind, member } = confirm;
    if (kind === "disaffiliate") {
      setMemberStatus.mutate({ id: member.id, status: "Desafiliado" });
      setToast(actionMessage(member.name, "disaffiliated"));
    } else {
      deleteMember.mutate(member.id);
      setToast(actionMessage(member.name, "deleted"));
    }
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
                onClick={() => downloadCsv("miembros.csv", membersToCsv(filtered))}
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
          onDelete={(member) => setConfirm({ kind: "delete", member })}
        />
      )}

      <MemberDrawer
        open={drawer !== null}
        mode={drawer?.mode ?? "view"}
        member={drawer?.member ?? null}
        onClose={() => setDrawer(null)}
        onEditMode={() => setDrawer((d) => (d ? { ...d, mode: "edit" } : d))}
        onSubmit={handleEditSubmit}
      />

      <MemberInviteDrawer
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreate={(data) => addMember.mutateAsync(data)}
        onProvision={(memberId) => provision.mutateAsync(memberId).then(() => undefined)}
      />

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm?.kind === "delete" ? "Eliminar miembro" : "Desafiliar miembro"}
        description={
          confirm
            ? confirm.kind === "delete"
              ? `¿Eliminar a ${confirm.member.name}? Se marcará como inactivo en el sistema, no se borra definitivamente.`
              : `¿Desafiliar a ${confirm.member.name}? Cambiará su estado a Desafiliado. Puedes revertirlo luego.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button as="button" type="button" variant="secondary" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
          <Button as="button" type="button" onClick={confirmAction}>
            {confirm?.kind === "delete" ? "Eliminar" : "Desafiliar"}
          </Button>
        </div>
      </Dialog>

      {toast && <Toast message={toast} icon={Icon.check({ s: 18 })} />}
    </div>
  );
}
