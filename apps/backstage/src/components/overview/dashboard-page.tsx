import { Card, Skeleton } from "@luminova/ui";
import { currentTermKey } from "@luminova/types";
import { useAuth } from "../../lib/auth/auth";
import { useCan } from "../../lib/authz/use-can";
import { useMembers } from "../../features/members/hooks/use-members";
import { useAllies } from "../../features/allies/hooks/use-allies";
import { useActivitiesByTerm } from "../../features/activities/hooks/use-activities-by-term";
import { useMemberPointsByTerm } from "../../features/members/hooks/use-member-points-by-term";
import { useInitiativesByTerm } from "../../features/initiatives/hooks/use-initiatives-by-term";
import { OverviewView } from "./overview-view";
import { buildDashboardModel } from "./dashboard-model";

export function DashboardPage() {
  const { user, claims } = useAuth();
  const gate = useCan();
  const termId = currentTermKey();
  // The two collection-level reads firestore.rules gates on a capability. Firing them
  // unconditionally meant any principal without them — Secretary, ActivityManager and the
  // long-standing ProjectManager — got PERMISSION_DENIED and the whole panel collapsed to
  // the load-error card. Their board-home layout already omits the widgets these feed, so
  // the honest degradation is "no data", not "everything is broken". Activities, points and
  // initiatives are signed-in-readable, so they need no gate.
  const canReadMembers = gate.can("read", "Member");
  const canReadAllies = gate.can("read", "Ally");
  const members = useMembers({ enabled: canReadMembers });
  const allies = useAllies({ enabled: canReadAllies });
  const activities = useActivitiesByTerm(termId);
  const memberPoints = useMemberPointsByTerm(termId);
  const initiatives = useInitiativesByTerm(termId, {
    includePrograms: true,
    includeProjects: true,
  });

  if (
    (canReadMembers && members.isError) ||
    (canReadAllies && allies.isError) ||
    activities.isError ||
    memberPoints.isError ||
    initiatives.isError
  ) {
    return (
      <Card padding="none" className="p-8 text-center text-ui-sm text-ink-3">
        No se pudo cargar el panel. Revisa tu conexión e intenta recargar la página.
      </Card>
    );
  }

  // A disabled query never resolves, so it must read as "settled" here or an ungated
  // principal loads forever. It settles as NULL — never `[]`: the model treats null as
  // "unknown, do not render", where `[]` would paint a fabricated "Aliados 0" over a
  // chapter with 14 allies.
  const membersData = canReadMembers ? members.data : null;
  const alliesData = canReadAllies ? allies.data : null;
  const membersPending = canReadMembers && !membersData;
  const alliesPending = canReadAllies && !alliesData;

  if (
    membersPending ||
    alliesPending ||
    !activities.data ||
    !memberPoints.data ||
    !initiatives.data
  ) {
    return (
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px]" />
        ))}
      </div>
    );
  }

  const now = new Date();
  const model = buildDashboardModel({
    members: membersData ?? null,
    allies: alliesData ?? null,
    activities: activities.data,
    memberPoints: memberPoints.data,
    initiatives: initiatives.data,
    now,
  });

  return (
    <OverviewView model={model} userName={user?.email ?? "—"} now={now} roles={claims.roles} />
  );
}
