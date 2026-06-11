import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { currentTermKey } from "@luminova/types";
import { usePositions } from "../features/positions/hooks/use-positions";
import { useMembers } from "../features/members/hooks/use-members";
import { buildPermissionsOverview } from "../features/positions/lib/permissions-overview";
import { PermisosView } from "../features/positions/components/permisos-view";
import { PageHeader } from "../components/page-header";
import { useAbility } from "../lib/authz/ability-context";

export const Route = createFileRoute("/_app/permisos")({
  component: PermisosPage,
});

function PermisosPage() {
  const isAdmin = useAbility().can("manage", "all");
  const { data: positions, isLoading: positionsLoading } = usePositions();
  const { data: members, isLoading: membersLoading } = useMembers();
  const rows = useMemo(
    () => buildPermissionsOverview(positions ?? [], members ?? [], currentTermKey()),
    [positions, members],
  );

  if (!isAdmin) {
    return (
      <p role="alert" className="text-ink-3">
        No autorizado.
      </p>
    );
  }

  const isLoading = positionsLoading || membersLoading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestión"
        title="Permisos"
        subtitle="Quién puede hacer qué, según los cargos asignados."
        actions={
          <Link to="/positions" className="text-[14px] text-jci-blue hover:underline">
            Editar permisos →
          </Link>
        }
      />
      <PermisosView rows={rows} isLoading={isLoading} />
    </div>
  );
}
