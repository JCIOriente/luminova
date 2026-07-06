import { createFileRoute, redirect } from "@tanstack/react-router";
import { Card, Skeleton } from "@luminova/ui";
import { currentTermKey } from "@luminova/types";
import { useAuth } from "../lib/auth/auth";
import { isMemberOnly } from "../lib/authz/is-member-only";
import { useMembers } from "../features/members/hooks/use-members";
import { useAllies } from "../features/allies/hooks/use-allies";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useMemberPointsByTerm } from "../features/members/hooks/use-member-points-by-term";
import { useInitiativesByTerm } from "../features/initiatives/hooks/use-initiatives-by-term";
import { OverviewView } from "../components/overview/overview-view";
import { buildDashboardModel } from "../components/overview/dashboard-model";

export const Route = createFileRoute("/_app/")({
  beforeLoad: async ({ context }) => {
    await context.auth.ready;
    if (isMemberOnly(context.auth.getState().claims)) throw redirect({ to: "/me" });
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { user, claims } = useAuth();
  const termId = currentTermKey();
  const members = useMembers();
  const allies = useAllies();
  const activities = useActivitiesByTerm(termId);
  const memberPoints = useMemberPointsByTerm(termId);
  const initiatives = useInitiativesByTerm(termId, {
    includePrograms: true,
    includeProjects: true,
  });

  if (
    members.isError ||
    allies.isError ||
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

  if (
    !members.data ||
    !allies.data ||
    !activities.data ||
    !memberPoints.data ||
    !initiatives.data
  ) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px]" />
        ))}
      </div>
    );
  }

  const now = new Date();
  const model = buildDashboardModel({
    members: members.data,
    allies: allies.data,
    activities: activities.data,
    memberPoints: memberPoints.data,
    initiatives: initiatives.data,
    now,
  });

  return (
    <OverviewView model={model} userName={user?.email ?? "—"} now={now} roles={claims.roles} />
  );
}
