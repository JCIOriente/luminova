import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@luminova/ui";
import { currentTermKey } from "@luminova/types";
import { usePositions } from "../hooks/use-positions";
import { useMembers } from "../../members/hooks/use-members";
import { useRoles } from "../../permissions/hooks/use-roles";
import { buildRoleOverview } from "../../permissions/lib/role-overview";
import { RolesPanel, type SectionState } from "../../permissions/components/roles-panel";
import { PageHeader } from "../../../components/page-header";
import { QueryErrorState } from "../../../components/query-error-state";
import { useCan } from "../../../lib/authz/use-can";

export function PermisosPage() {
  // roles-collection writes are Admin-role-only (hasAnyRole(['Admin'])), not the
  // manage:all perm — gate on the role so a manage:all-perm custom role doesn't see
  // a RolesPanel whose every write the rules deny.
  const isAdmin = useCan().isAdmin;
  // Gate the reads on isAdmin: a non-Admin who types /permisos directly shouldn't
  // fire collection queries Firestore would deny anyway (least-privilege).
  const {
    data: positions,
    isLoading: positionsLoading,
    isError: positionsError,
    refetch: refetchPositions,
  } = usePositions({ enabled: isAdmin });
  const {
    data: members,
    isLoading: membersLoading,
    isError: membersError,
    refetch: refetchMembers,
  } = useMembers({ enabled: isAdmin });
  const {
    data: roles,
    isLoading: rolesLoading,
    isError: rolesError,
    error: rolesErr,
    refetch: refetchRoles,
  } = useRoles({ enabled: isAdmin });
  const rows = useMemo(
    () => buildRoleOverview(roles ?? [], positions ?? [], members ?? [], currentTermKey()),
    [roles, positions, members],
  );

  if (!isAdmin) {
    return (
      <p role="alert" className="text-ink-3">
        No autorizado.
      </p>
    );
  }

  const retryAll = () => {
    refetchPositions();
    refetchMembers();
    refetchRoles();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestión"
        title="Permisos"
        subtitle="Cada rol, qué cargo lo otorga y quién lo tiene. Los permisos efectivos de cada miembro se sincronizan al iniciar sesión."
        actions={
          <Link to="/positions" className="text-ui-md text-jci-blue hover:underline">
            Editar permisos →
          </Link>
        }
      />
      {/* Only the `roles` query gates the panel. Unioning all three used to fail the
          whole page closed — including the ONLY affordance that can restore a
          deactivated role, so one bad members read made it permanently unrestorable.
          positions/members degrade inside the panel instead: each section says
          "Cargando…" or "No disponible" rather than rendering an empty list as fact. */}
      {rolesError ? (
        <QueryErrorState error={rolesErr} onRetry={retryAll} />
      ) : rolesLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (
        <RolesPanel
          rows={rows}
          cargosState={sectionState(positionsLoading, positionsError)}
          holdersState={sectionState(membersLoading, membersError)}
        />
      )}
    </div>
  );
}

function sectionState(isLoading: boolean, isError: boolean): SectionState {
  // Error before loading: a partial outage must not paint a spinner forever while one
  // query retries.
  if (isError) return "error";
  return isLoading ? "loading" : "ok";
}
