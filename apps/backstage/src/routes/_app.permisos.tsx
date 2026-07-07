import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { currentTermKey } from "@luminova/types";
import { usePositions } from "../features/positions/hooks/use-positions";
import { useMembers } from "../features/members/hooks/use-members";
import { buildPermissionsOverview } from "../features/positions/lib/permissions-overview";
import { PermisosView } from "../features/positions/components/permisos-view";
import { RoleManager } from "../features/permissions/components/role-manager";
import { PageHeader } from "../components/page-header";
import { QueryErrorState } from "../components/query-error-state";
import { useCan } from "../lib/authz/use-can";

export const Route = createFileRoute("/_app/permisos")({
  component: PermisosPage,
});

function PermisosPage() {
  // roles-collection writes are Admin-role-only (hasAnyRole(['Admin'])), not the
  // manage:all perm — gate on the role so a manage:all-perm custom role doesn't see
  // a RoleManager whose every write the rules deny.
  const isAdmin = useCan().isAdmin;
  // Gate the reads on isAdmin: a non-Admin who types /permisos directly shouldn't
  // fire collection queries Firestore would deny anyway (least-privilege).
  const {
    data: positions,
    isLoading: positionsLoading,
    isError: positionsError,
    error: positionsErr,
    refetch: refetchPositions,
  } = usePositions({ enabled: isAdmin });
  const {
    data: members,
    isLoading: membersLoading,
    isError: membersError,
    error: membersErr,
    refetch: refetchMembers,
  } = useMembers({ enabled: isAdmin });
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
  const isError = positionsError || membersError;
  const loadError = positionsErr ?? membersErr;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestión"
        title="Permisos"
        subtitle="Quién puede hacer qué, según los cargos asignados."
        actions={
          <Link to="/positions" className="text-ui-md text-jci-blue hover:underline">
            Editar permisos →
          </Link>
        }
      />
      {isError ? (
        <QueryErrorState
          error={loadError}
          onRetry={() => {
            refetchPositions();
            refetchMembers();
          }}
        />
      ) : (
        <PermisosView rows={rows} isLoading={isLoading} />
      )}
      <p className="text-ui-xs text-ink-3">
        Refleja los cargos del catálogo. Los permisos efectivos de cada miembro se sincronizan al
        iniciar sesión.
      </p>
      <RoleManager />
    </div>
  );
}
